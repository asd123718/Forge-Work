import assert from "assert";
import { Constants } from "../../../../base/common/uint.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { DiffComputer } from "../../../common/diff/legacyLinesDiffComputer.js";
import { createTextModel } from "../testTextModel.js";
function assertDiff(originalLines, modifiedLines, expectedChanges, shouldComputeCharChanges = true, shouldPostProcessCharChanges = false, shouldIgnoreTrimWhitespace = false) {
  const diffComputer = new DiffComputer(originalLines, modifiedLines, {
    shouldComputeCharChanges,
    shouldPostProcessCharChanges,
    shouldIgnoreTrimWhitespace,
    shouldMakePrettyDiff: true,
    maxComputationTime: 0
  });
  const changes = diffComputer.computeDiff().changes;
  const mapCharChange = (charChange) => {
    return {
      originalStartLineNumber: charChange.originalStartLineNumber,
      originalStartColumn: charChange.originalStartColumn,
      originalEndLineNumber: charChange.originalEndLineNumber,
      originalEndColumn: charChange.originalEndColumn,
      modifiedStartLineNumber: charChange.modifiedStartLineNumber,
      modifiedStartColumn: charChange.modifiedStartColumn,
      modifiedEndLineNumber: charChange.modifiedEndLineNumber,
      modifiedEndColumn: charChange.modifiedEndColumn
    };
  };
  const actual = changes.map((lineChange) => {
    return {
      originalStartLineNumber: lineChange.originalStartLineNumber,
      originalEndLineNumber: lineChange.originalEndLineNumber,
      modifiedStartLineNumber: lineChange.modifiedStartLineNumber,
      modifiedEndLineNumber: lineChange.modifiedEndLineNumber,
      charChanges: lineChange.charChanges ? lineChange.charChanges.map(mapCharChange) : void 0
    };
  });
  assert.deepStrictEqual(actual, expectedChanges);
  if (!shouldIgnoreTrimWhitespace) {
    const modifiedTextModel = createTextModel(modifiedLines.join("\n"));
    const expectedValue = modifiedTextModel.getValue();
    {
      const originalTextModel = createTextModel(originalLines.join("\n"));
      originalTextModel.applyEdits(changes.map((c) => getLineEdit(c, modifiedTextModel)));
      assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
      originalTextModel.dispose();
    }
    if (shouldComputeCharChanges) {
      const originalTextModel = createTextModel(originalLines.join("\n"));
      originalTextModel.applyEdits(changes.flatMap((c) => getCharEdits(c, modifiedTextModel)));
      assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
      originalTextModel.dispose();
    }
    modifiedTextModel.dispose();
  }
}
function getCharEdits(lineChange, modifiedTextModel) {
  if (!lineChange.charChanges) {
    return [getLineEdit(lineChange, modifiedTextModel)];
  }
  return lineChange.charChanges.map((c) => {
    const originalRange = new Range(c.originalStartLineNumber, c.originalStartColumn, c.originalEndLineNumber, c.originalEndColumn);
    const modifiedRange = new Range(c.modifiedStartLineNumber, c.modifiedStartColumn, c.modifiedEndLineNumber, c.modifiedEndColumn);
    return {
      range: originalRange,
      text: modifiedTextModel.getValueInRange(modifiedRange)
    };
  });
}
function getLineEdit(lineChange, modifiedTextModel) {
  let originalRange;
  if (lineChange.originalEndLineNumber === 0) {
    originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
  } else {
    originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
  }
  let modifiedRange;
  if (lineChange.modifiedEndLineNumber === 0) {
    modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
  } else {
    modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
  }
  const [r1, r2] = diffFromLineRanges(originalRange, modifiedRange);
  return {
    range: r1,
    text: modifiedTextModel.getValueInRange(r2)
  };
}
function diffFromLineRanges(originalRange, modifiedRange) {
  if (originalRange.startLineNumber === 1 || modifiedRange.startLineNumber === 1) {
    if (!originalRange.isEmpty && !modifiedRange.isEmpty) {
      return [
        new Range(
          originalRange.startLineNumber,
          1,
          originalRange.endLineNumberExclusive - 1,
          Constants.MAX_SAFE_SMALL_INTEGER
        ),
        new Range(
          modifiedRange.startLineNumber,
          1,
          modifiedRange.endLineNumberExclusive - 1,
          Constants.MAX_SAFE_SMALL_INTEGER
        )
      ];
    }
    return [
      new Range(
        originalRange.startLineNumber,
        1,
        originalRange.endLineNumberExclusive,
        1
      ),
      new Range(
        modifiedRange.startLineNumber,
        1,
        modifiedRange.endLineNumberExclusive,
        1
      )
    ];
  }
  return [
    new Range(
      originalRange.startLineNumber - 1,
      Constants.MAX_SAFE_SMALL_INTEGER,
      originalRange.endLineNumberExclusive - 1,
      Constants.MAX_SAFE_SMALL_INTEGER
    ),
    new Range(
      modifiedRange.startLineNumber - 1,
      Constants.MAX_SAFE_SMALL_INTEGER,
      modifiedRange.endLineNumberExclusive - 1,
      Constants.MAX_SAFE_SMALL_INTEGER
    )
  ];
}
class LineRange {
  constructor(startLineNumber, lineCount) {
    this.startLineNumber = startLineNumber;
    this.lineCount = lineCount;
  }
  get isEmpty() {
    return this.lineCount === 0;
  }
  get endLineNumberExclusive() {
    return this.startLineNumber + this.lineCount;
  }
}
function createLineDeletion(startLineNumber, endLineNumber, modifiedLineNumber) {
  return {
    originalStartLineNumber: startLineNumber,
    originalEndLineNumber: endLineNumber,
    modifiedStartLineNumber: modifiedLineNumber,
    modifiedEndLineNumber: 0,
    charChanges: void 0
  };
}
function createLineInsertion(startLineNumber, endLineNumber, originalLineNumber) {
  return {
    originalStartLineNumber: originalLineNumber,
    originalEndLineNumber: 0,
    modifiedStartLineNumber: startLineNumber,
    modifiedEndLineNumber: endLineNumber,
    charChanges: void 0
  };
}
function createLineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges) {
  return {
    originalStartLineNumber,
    originalEndLineNumber,
    modifiedStartLineNumber,
    modifiedEndLineNumber,
    charChanges
  };
}
function createCharChange(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn, modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
  return {
    originalStartLineNumber,
    originalStartColumn,
    originalEndLineNumber,
    originalEndColumn,
    modifiedStartLineNumber,
    modifiedStartColumn,
    modifiedEndLineNumber,
    modifiedEndColumn
  };
}
suite("Editor Diff - DiffComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("one inserted line below", () => {
    const original = ["line"];
    const modified = ["line", "new line"];
    const expected = [createLineInsertion(2, 2, 1)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines below", () => {
    const original = ["line"];
    const modified = ["line", "new line", "another new line"];
    const expected = [createLineInsertion(2, 3, 1)];
    assertDiff(original, modified, expected);
  });
  test("one inserted line above", () => {
    const original = ["line"];
    const modified = ["new line", "line"];
    const expected = [createLineInsertion(1, 1, 0)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines above", () => {
    const original = ["line"];
    const modified = ["new line", "another new line", "line"];
    const expected = [createLineInsertion(1, 2, 0)];
    assertDiff(original, modified, expected);
  });
  test("one inserted line in middle", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "line3", "line4"];
    const expected = [createLineInsertion(3, 3, 2)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines in middle", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "another new line", "line3", "line4"];
    const expected = [createLineInsertion(3, 4, 2)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines in middle interrupted", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "line3", "another new line", "line4"];
    const expected = [createLineInsertion(3, 3, 2), createLineInsertion(5, 5, 3)];
    assertDiff(original, modified, expected);
  });
  test("one deleted line below", () => {
    const original = ["line", "new line"];
    const modified = ["line"];
    const expected = [createLineDeletion(2, 2, 1)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines below", () => {
    const original = ["line", "new line", "another new line"];
    const modified = ["line"];
    const expected = [createLineDeletion(2, 3, 1)];
    assertDiff(original, modified, expected);
  });
  test("one deleted lines above", () => {
    const original = ["new line", "line"];
    const modified = ["line"];
    const expected = [createLineDeletion(1, 1, 0)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines above", () => {
    const original = ["new line", "another new line", "line"];
    const modified = ["line"];
    const expected = [createLineDeletion(1, 2, 0)];
    assertDiff(original, modified, expected);
  });
  test("one deleted line in middle", () => {
    const original = ["line1", "line2", "new line", "line3", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 3, 2)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines in middle", () => {
    const original = ["line1", "line2", "new line", "another new line", "line3", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 4, 2)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines in middle interrupted", () => {
    const original = ["line1", "line2", "new line", "line3", "another new line", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 3, 2), createLineDeletion(5, 5, 3)];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted at the end", () => {
    const original = ["line"];
    const modified = ["line changed"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 5, 1, 5, 1, 5, 1, 13)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted at the beginning", () => {
    const original = ["line"];
    const modified = ["my line"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 1, 1, 1, 1, 1, 1, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted in the middle", () => {
    const original = ["abba"];
    const modified = ["abzzba"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 3, 1, 3, 1, 3, 1, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted in the middle (two spots)", () => {
    const original = ["abba"];
    const modified = ["abzzbzza"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 3, 1, 3, 1, 3, 1, 5),
        createCharChange(1, 4, 1, 4, 1, 6, 1, 8)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars deleted 1", () => {
    const original = ["abcdefg"];
    const modified = ["abcfg"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 4, 1, 6, 1, 4, 1, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars deleted 2", () => {
    const original = ["abcdefg"];
    const modified = ["acfg"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 2, 1, 3, 1, 2, 1, 2),
        createCharChange(1, 4, 1, 6, 1, 3, 1, 3)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 1", () => {
    const original = ["abcd", "efgh"];
    const modified = ["abcz"];
    const expected = [
      createLineChange(1, 2, 1, 1, [
        createCharChange(1, 4, 2, 5, 1, 4, 1, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 2", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "abcz", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 2, [
        createCharChange(2, 4, 3, 5, 2, 4, 2, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 3", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "abcz", "zzzzefgh", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 3, [
        createCharChange(2, 4, 2, 5, 2, 4, 2, 5),
        createCharChange(3, 1, 3, 1, 3, 1, 3, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 4", () => {
    const original = ["abc"];
    const modified = ["", "", "axc", ""];
    const expected = [
      createLineChange(1, 1, 1, 4, [
        createCharChange(1, 1, 1, 1, 1, 1, 3, 1),
        createCharChange(1, 2, 1, 3, 3, 2, 3, 3),
        createCharChange(1, 4, 1, 4, 3, 4, 4, 1)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("empty original sequence in char diff", () => {
    const original = ["abc", "", "xyz"];
    const modified = ["abc", "qwe", "rty", "xyz"];
    const expected = [
      createLineChange(2, 2, 2, 3)
    ];
    assertDiff(original, modified, expected);
  });
  test("three lines changed", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 3, [
        createCharChange(2, 1, 3, 1, 2, 1, 2, 4),
        createCharChange(3, 5, 3, 5, 2, 8, 3, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("big change part 1", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["hello", "foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("big change part 2", () => {
    const original = ["foo", "abcd", "efgh", "BAR", "RAB"];
    const modified = ["hello", "foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
      ]),
      createLineDeletion(5, 5, 5)
    ];
    assertDiff(original, modified, expected);
  });
  test("char change postprocessing merges", () => {
    const original = ["abba"];
    const modified = ["azzzbzzzbzzza"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 2, 1, 4, 1, 2, 1, 13)
      ])
    ];
    assertDiff(original, modified, expected, true, true);
  });
  test("ignore trim whitespace", () => {
    const original = ["		 foo ", "abcd", "efgh", "		 BAR		"];
    const modified = ["  hello	", "	 foo   	", "zzzefgh", "xxx", "   BAR   	"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 4, 1, 4, 4)
      ])
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("issue #12122 r.hasOwnProperty is not a function", () => {
    const original = ["hasOwnProperty"];
    const modified = ["hasOwnProperty", "and another line"];
    const expected = [
      createLineInsertion(2, 2, 1)
    ];
    assertDiff(original, modified, expected);
  });
  test("empty diff 1", () => {
    const original = [""];
    const modified = ["something"];
    const expected = [
      createLineChange(1, 1, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 2", () => {
    const original = [""];
    const modified = ["something", "something else"];
    const expected = [
      createLineChange(1, 1, 1, 2, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 3", () => {
    const original = ["something", "something else"];
    const modified = [""];
    const expected = [
      createLineChange(1, 2, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 4", () => {
    const original = ["something"];
    const modified = [""];
    const expected = [
      createLineChange(1, 1, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 5", () => {
    const original = [""];
    const modified = [""];
    const expected = [];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 1", () => {
    const original = [
      "suite(function () {",
      "	test1() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test2() {",
      "		assert.ok(true);",
      "	}",
      "});",
      ""
    ];
    const modified = [
      "// An insertion",
      "suite(function () {",
      "	test1() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test2() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test3() {",
      "		assert.ok(true);",
      "	}",
      "});",
      ""
    ];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineInsertion(10, 13, 8)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 2", () => {
    const original = [
      "// Just a comment",
      "",
      "function compute(a, b, c, d) {",
      "	if (a) {",
      "		if (b) {",
      "			if (c) {",
      "				return 5;",
      "			}",
      "		}",
      "		// These next lines will be deleted",
      "		if (d) {",
      "			return -1;",
      "		}",
      "		return 0;",
      "	}",
      "}"
    ];
    const modified = [
      "// Here is an inserted line",
      "// and another inserted line",
      "// and another one",
      "// Just a comment",
      "",
      "function compute(a, b, c, d) {",
      "	if (a) {",
      "		if (b) {",
      "			if (c) {",
      "				return 5;",
      "			}",
      "		}",
      "		return 0;",
      "	}",
      "}"
    ];
    const expected = [
      createLineInsertion(1, 3, 0),
      createLineDeletion(10, 13, 12)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 3", () => {
    const original = [
      "class A {",
      "	/**",
      "	 * m1",
      "	 */",
      "	method1() {}",
      "",
      "	/**",
      "	 * m3",
      "	 */",
      "	method3() {}",
      "}"
    ];
    const modified = [
      "class A {",
      "	/**",
      "	 * m1",
      "	 */",
      "	method1() {}",
      "",
      "	/**",
      "	 * m2",
      "	 */",
      "	method2() {}",
      "",
      "	/**",
      "	 * m3",
      "	 */",
      "	method3() {}",
      "}"
    ];
    const expected = [
      createLineInsertion(7, 11, 6)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("issue #23636", () => {
    const original = [
      "if(!TextDrawLoad[playerid])",
      "{",
      "",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[4]);",
      "	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);",
      "	}",
      "	else",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);",
      "	}",
      "}",
      "else",
      "{",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[27]);",
      "	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);",
      "	}",
      "	else",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);",
      "	}",
      "}"
    ];
    const modified = [
      "	if(!TextDrawLoad[playerid])",
      "	{",
      "	",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[4]);",
      "		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);",
      "		}",
      "		else",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);",
      "		}",
      "	}",
      "	else",
      "	{",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[27]);",
      "		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);",
      "		}",
      "		else",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);",
      "		}",
      "	}"
    ];
    const expected = [
      createLineChange(
        1,
        27,
        1,
        27,
        [
          createCharChange(1, 1, 1, 1, 1, 1, 1, 2),
          createCharChange(2, 1, 2, 1, 2, 1, 2, 2),
          createCharChange(3, 1, 3, 1, 3, 1, 3, 2),
          createCharChange(4, 1, 4, 1, 4, 1, 4, 2),
          createCharChange(5, 1, 5, 1, 5, 1, 5, 2),
          createCharChange(6, 1, 6, 1, 6, 1, 6, 2),
          createCharChange(7, 1, 7, 1, 7, 1, 7, 2),
          createCharChange(8, 1, 8, 1, 8, 1, 8, 2),
          createCharChange(9, 1, 9, 1, 9, 1, 9, 2),
          createCharChange(10, 1, 10, 1, 10, 1, 10, 2),
          createCharChange(11, 1, 11, 1, 11, 1, 11, 2),
          createCharChange(12, 1, 12, 1, 12, 1, 12, 2),
          createCharChange(13, 1, 13, 1, 13, 1, 13, 2),
          createCharChange(14, 1, 14, 1, 14, 1, 14, 2),
          createCharChange(15, 1, 15, 1, 15, 1, 15, 2),
          createCharChange(16, 1, 16, 1, 16, 1, 16, 2),
          createCharChange(17, 1, 17, 1, 17, 1, 17, 2),
          createCharChange(18, 1, 18, 1, 18, 1, 18, 2),
          createCharChange(19, 1, 19, 1, 19, 1, 19, 2),
          createCharChange(20, 1, 20, 1, 20, 1, 20, 2),
          createCharChange(21, 1, 21, 1, 21, 1, 21, 2),
          createCharChange(22, 1, 22, 1, 22, 1, 22, 2),
          createCharChange(23, 1, 23, 1, 23, 1, 23, 2),
          createCharChange(24, 1, 24, 1, 24, 1, 24, 2),
          createCharChange(25, 1, 25, 1, 25, 1, 25, 2),
          createCharChange(26, 1, 26, 1, 26, 1, 26, 2),
          createCharChange(27, 1, 27, 1, 27, 1, 27, 2)
        ]
      )
      // createLineInsertion(7, 11, 6)
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("issue #43922", () => {
    const original = [
      " * `yarn [install]` -- Install project NPM dependencies. This is automatically done when you first create the project. You should only need to run this if you add dependencies in `package.json`."
    ];
    const modified = [
      " * `yarn` -- Install project NPM dependencies. You should only need to run this if you add dependencies in `package.json`."
    ];
    const expected = [
      createLineChange(
        1,
        1,
        1,
        1,
        [
          createCharChange(1, 9, 1, 19, 1, 9, 1, 9),
          createCharChange(1, 58, 1, 120, 1, 48, 1, 48)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("issue #42751", () => {
    const original = [
      "    1",
      "  2"
    ];
    const modified = [
      "    1",
      "   3"
    ];
    const expected = [
      createLineChange(
        2,
        2,
        2,
        2,
        [
          createCharChange(2, 3, 2, 4, 2, 3, 2, 5)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("does not give character changes", () => {
    const original = [
      "    1",
      "  2",
      "A"
    ];
    const modified = [
      "    1",
      "   3",
      " A"
    ];
    const expected = [
      createLineChange(
        2,
        3,
        2,
        3
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #44422: Less than ideal diff results", () => {
    const original = [
      "export class C {",
      "",
      "	public m1(): void {",
      "		{",
      "		//2",
      "		//3",
      "		//4",
      "		//5",
      "		//6",
      "		//7",
      "		//8",
      "		//9",
      "		//10",
      "		//11",
      "		//12",
      "		//13",
      "		//14",
      "		//15",
      "		//16",
      "		//17",
      "		//18",
      "		}",
      "	}",
      "",
      "	public m2(): void {",
      "		if (a) {",
      "			if (b) {",
      "				//A1",
      "				//A2",
      "				//A3",
      "				//A4",
      "				//A5",
      "				//A6",
      "				//A7",
      "				//A8",
      "			}",
      "		}",
      "",
      "		//A9",
      "		//A10",
      "		//A11",
      "		//A12",
      "		//A13",
      "		//A14",
      "		//A15",
      "	}",
      "",
      "	public m3(): void {",
      "		if (a) {",
      "			//B1",
      "		}",
      "		//B2",
      "		//B3",
      "	}",
      "",
      "	public m4(): boolean {",
      "		//1",
      "		//2",
      "		//3",
      "		//4",
      "	}",
      "",
      "}"
    ];
    const modified = [
      "export class C {",
      "",
      "	constructor() {",
      "",
      "",
      "",
      "",
      "	}",
      "",
      "	public m1(): void {",
      "		{",
      "		//2",
      "		//3",
      "		//4",
      "		//5",
      "		//6",
      "		//7",
      "		//8",
      "		//9",
      "		//10",
      "		//11",
      "		//12",
      "		//13",
      "		//14",
      "		//15",
      "		//16",
      "		//17",
      "		//18",
      "		}",
      "	}",
      "",
      "	public m4(): boolean {",
      "		//1",
      "		//2",
      "		//3",
      "		//4",
      "	}",
      "",
      "}"
    ];
    const expected = [
      createLineChange(
        2,
        0,
        3,
        9
      ),
      createLineChange(
        25,
        55,
        31,
        0
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("gives preference to matching longer lines", () => {
    const original = [
      "A",
      "A",
      "BB",
      "C"
    ];
    const modified = [
      "A",
      "BB",
      "A",
      "D",
      "E",
      "A",
      "C"
    ];
    const expected = [
      createLineChange(
        2,
        2,
        1,
        0
      ),
      createLineChange(
        3,
        0,
        3,
        6
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #119051: gives preference to fewer diff hunks", () => {
    const original = [
      "1",
      "",
      "",
      "2",
      ""
    ];
    const modified = [
      "1",
      "",
      "1.5",
      "",
      "",
      "2",
      "",
      "3",
      ""
    ];
    const expected = [
      createLineChange(
        2,
        0,
        3,
        4
      ),
      createLineChange(
        5,
        0,
        8,
        9
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #121436: Diff chunk contains an unchanged line part 1", () => {
    const original = [
      "if (cond) {",
      "    cmd",
      "}"
    ];
    const modified = [
      "if (cond) {",
      "    if (other_cond) {",
      "        cmd",
      "    }",
      "}"
    ];
    const expected = [
      createLineChange(
        1,
        0,
        2,
        2
      ),
      createLineChange(
        2,
        0,
        4,
        4
      )
    ];
    assertDiff(original, modified, expected, false, false, true);
  });
  test("issue #121436: Diff chunk contains an unchanged line part 2", () => {
    const original = [
      "if (cond) {",
      "    cmd",
      "}"
    ];
    const modified = [
      "if (cond) {",
      "    if (other_cond) {",
      "        cmd",
      "    }",
      "}"
    ];
    const expected = [
      createLineChange(
        1,
        0,
        2,
        2
      ),
      createLineChange(
        2,
        2,
        3,
        3
      ),
      createLineChange(
        2,
        0,
        4,
        4
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #169552: Assertion error when having both leading and trailing whitespace diffs", () => {
    const original = [
      "if True:",
      "    print(2)"
    ];
    const modified = [
      "if True:",
      "	print(2) "
    ];
    const expected = [
      createLineChange(
        2,
        2,
        2,
        2,
        [
          createCharChange(2, 1, 2, 5, 2, 1, 2, 2),
          createCharChange(2, 13, 2, 13, 2, 10, 2, 11)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, false, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcZGlmZlxcZGlmZkNvbXB1dGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRGlmZkNvbXB1dGVyLCBJQ2hhckNoYW5nZSwgSUxpbmVDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbmZ1bmN0aW9uIGFzc2VydERpZmYob3JpZ2luYWxMaW5lczogc3RyaW5nW10sIG1vZGlmaWVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZENoYW5nZXM6IElMaW5lQ2hhbmdlW10sIHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogYm9vbGVhbiA9IHRydWUsIHNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXM6IGJvb2xlYW4gPSBmYWxzZSwgc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRjb25zdCBkaWZmQ29tcHV0ZXIgPSBuZXcgRGlmZkNvbXB1dGVyKG9yaWdpbmFsTGluZXMsIG1vZGlmaWVkTGluZXMsIHtcblx0XHRzaG91bGRDb21wdXRlQ2hhckNoYW5nZXMsXG5cdFx0c2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlcyxcblx0XHRzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSxcblx0XHRzaG91bGRNYWtlUHJldHR5RGlmZjogdHJ1ZSxcblx0XHRtYXhDb21wdXRhdGlvblRpbWU6IDBcblx0fSk7XG5cdGNvbnN0IGNoYW5nZXMgPSBkaWZmQ29tcHV0ZXIuY29tcHV0ZURpZmYoKS5jaGFuZ2VzO1xuXG5cdGNvbnN0IG1hcENoYXJDaGFuZ2UgPSAoY2hhckNoYW5nZTogSUNoYXJDaGFuZ2UpID0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IGNoYXJDaGFuZ2Uub3JpZ2luYWxTdGFydExpbmVOdW1iZXIsXG5cdFx0XHRvcmlnaW5hbFN0YXJ0Q29sdW1uOiBjaGFyQ2hhbmdlLm9yaWdpbmFsU3RhcnRDb2x1bW4sXG5cdFx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IGNoYXJDaGFuZ2Uub3JpZ2luYWxFbmRMaW5lTnVtYmVyLFxuXHRcdFx0b3JpZ2luYWxFbmRDb2x1bW46IGNoYXJDaGFuZ2Uub3JpZ2luYWxFbmRDb2x1bW4sXG5cdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogY2hhckNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlcixcblx0XHRcdG1vZGlmaWVkU3RhcnRDb2x1bW46IGNoYXJDaGFuZ2UubW9kaWZpZWRTdGFydENvbHVtbixcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogY2hhckNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIsXG5cdFx0XHRtb2RpZmllZEVuZENvbHVtbjogY2hhckNoYW5nZS5tb2RpZmllZEVuZENvbHVtbixcblx0XHR9O1xuXHR9O1xuXG5cdGNvbnN0IGFjdHVhbCA9IGNoYW5nZXMubWFwKChsaW5lQ2hhbmdlKSA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBsaW5lQ2hhbmdlLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBsaW5lQ2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlcixcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBsaW5lQ2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBsaW5lQ2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlcixcblx0XHRcdGNoYXJDaGFuZ2VzOiAobGluZUNoYW5nZS5jaGFyQ2hhbmdlcyA/IGxpbmVDaGFuZ2UuY2hhckNoYW5nZXMubWFwKG1hcENoYXJDaGFuZ2UpIDogdW5kZWZpbmVkKVxuXHRcdH07XG5cdH0pO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZENoYW5nZXMpO1xuXG5cdGlmICghc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UpIHtcblx0XHQvLyBUaGUgZGlmZnMgc2hvdWxkIGRlc2NyaWJlIGhvdyB0byBhcHBseSBlZGl0cyB0byB0aGUgb3JpZ2luYWwgdGV4dCBtb2RlbCB0byBnZXQgdG8gdGhlIG1vZGlmaWVkIHRleHQgbW9kZWwuXG5cblx0XHRjb25zdCBtb2RpZmllZFRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChtb2RpZmllZExpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRjb25zdCBleHBlY3RlZFZhbHVlID0gbW9kaWZpZWRUZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblxuXHRcdHtcblx0XHRcdC8vIExpbmUgY2hhbmdlczpcblx0XHRcdGNvbnN0IG9yaWdpbmFsVGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKG9yaWdpbmFsTGluZXMuam9pbignXFxuJykpO1xuXHRcdFx0b3JpZ2luYWxUZXh0TW9kZWwuYXBwbHlFZGl0cyhjaGFuZ2VzLm1hcChjID0+IGdldExpbmVFZGl0KGMsIG1vZGlmaWVkVGV4dE1vZGVsKSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmlnaW5hbFRleHRNb2RlbC5nZXRWYWx1ZSgpLCBleHBlY3RlZFZhbHVlKTtcblx0XHRcdG9yaWdpbmFsVGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzKSB7XG5cdFx0XHQvLyBDaGFyIGNoYW5nZXM6XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChvcmlnaW5hbExpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdG9yaWdpbmFsVGV4dE1vZGVsLmFwcGx5RWRpdHMoY2hhbmdlcy5mbGF0TWFwKGMgPT4gZ2V0Q2hhckVkaXRzKGMsIG1vZGlmaWVkVGV4dE1vZGVsKSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmlnaW5hbFRleHRNb2RlbC5nZXRWYWx1ZSgpLCBleHBlY3RlZFZhbHVlKTtcblx0XHRcdG9yaWdpbmFsVGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRtb2RpZmllZFRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Q2hhckVkaXRzKGxpbmVDaGFuZ2U6IElMaW5lQ2hhbmdlLCBtb2RpZmllZFRleHRNb2RlbDogSVRleHRNb2RlbCk6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdIHtcblx0aWYgKCFsaW5lQ2hhbmdlLmNoYXJDaGFuZ2VzKSB7XG5cdFx0cmV0dXJuIFtnZXRMaW5lRWRpdChsaW5lQ2hhbmdlLCBtb2RpZmllZFRleHRNb2RlbCldO1xuXHR9XG5cdHJldHVybiBsaW5lQ2hhbmdlLmNoYXJDaGFuZ2VzLm1hcChjID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gbmV3IFJhbmdlKGMub3JpZ2luYWxTdGFydExpbmVOdW1iZXIsIGMub3JpZ2luYWxTdGFydENvbHVtbiwgYy5vcmlnaW5hbEVuZExpbmVOdW1iZXIsIGMub3JpZ2luYWxFbmRDb2x1bW4pO1xuXHRcdGNvbnN0IG1vZGlmaWVkUmFuZ2UgPSBuZXcgUmFuZ2UoYy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciwgYy5tb2RpZmllZFN0YXJ0Q29sdW1uLCBjLm1vZGlmaWVkRW5kTGluZU51bWJlciwgYy5tb2RpZmllZEVuZENvbHVtbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBvcmlnaW5hbFJhbmdlLFxuXHRcdFx0dGV4dDogbW9kaWZpZWRUZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKG1vZGlmaWVkUmFuZ2UpXG5cdFx0fTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGdldExpbmVFZGl0KGxpbmVDaGFuZ2U6IElMaW5lQ2hhbmdlLCBtb2RpZmllZFRleHRNb2RlbDogSVRleHRNb2RlbCk6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbiB7XG5cdGxldCBvcmlnaW5hbFJhbmdlOiBMaW5lUmFuZ2U7XG5cdGlmIChsaW5lQ2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlciA9PT0gMCkge1xuXHRcdC8vIEluc2VydGlvblxuXHRcdG9yaWdpbmFsUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGxpbmVDaGFuZ2Uub3JpZ2luYWxTdGFydExpbmVOdW1iZXIgKyAxLCAwKTtcblx0fSBlbHNlIHtcblx0XHRvcmlnaW5hbFJhbmdlID0gbmV3IExpbmVSYW5nZShsaW5lQ2hhbmdlLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLCBsaW5lQ2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlciAtIGxpbmVDaGFuZ2Uub3JpZ2luYWxTdGFydExpbmVOdW1iZXIgKyAxKTtcblx0fVxuXG5cdGxldCBtb2RpZmllZFJhbmdlOiBMaW5lUmFuZ2U7XG5cdGlmIChsaW5lQ2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciA9PT0gMCkge1xuXHRcdC8vIERlbGV0aW9uXG5cdFx0bW9kaWZpZWRSYW5nZSA9IG5ldyBMaW5lUmFuZ2UobGluZUNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciArIDEsIDApO1xuXHR9IGVsc2Uge1xuXHRcdG1vZGlmaWVkUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGxpbmVDaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIGxpbmVDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyIC0gbGluZUNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciArIDEpO1xuXHR9XG5cblx0Y29uc3QgW3IxLCByMl0gPSBkaWZmRnJvbUxpbmVSYW5nZXMob3JpZ2luYWxSYW5nZSwgbW9kaWZpZWRSYW5nZSk7XG5cdHJldHVybiB7XG5cdFx0cmFuZ2U6IHIxLFxuXHRcdHRleHQ6IG1vZGlmaWVkVGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShyMiksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGRpZmZGcm9tTGluZVJhbmdlcyhvcmlnaW5hbFJhbmdlOiBMaW5lUmFuZ2UsIG1vZGlmaWVkUmFuZ2U6IExpbmVSYW5nZSk6IFtSYW5nZSwgUmFuZ2VdIHtcblx0aWYgKG9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSAxIHx8IG1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0aWYgKCFvcmlnaW5hbFJhbmdlLmlzRW1wdHkgJiYgIW1vZGlmaWVkUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bmV3IFJhbmdlKFxuXHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0b3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHRcdFx0KSxcblx0XHRcdFx0bmV3IFJhbmdlKFxuXHRcdFx0XHRcdG1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHRcdFx0KVxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIG9uZSBvZiB0aGVtIGlzIG9uZSBhbmQgb25lIG9mIHRoZW0gaXMgZW1wdHksIHRoZSBvdGhlciBjYW5ub3QgYmUgdGhlIGxhc3QgbGluZSBvZiB0aGUgZG9jdW1lbnRcblx0XHRyZXR1cm4gW1xuXHRcdFx0bmV3IFJhbmdlKFxuXHRcdFx0XHRvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0MSxcblx0XHRcdFx0b3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdFx0XHQxLFxuXHRcdFx0KSxcblx0XHRcdG5ldyBSYW5nZShcblx0XHRcdFx0bW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdDEsXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdFx0MSxcblx0XHRcdClcblx0XHRdO1xuXHR9XG5cblx0cmV0dXJuIFtcblx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsXG5cdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHRcdG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHQpLFxuXHRcdG5ldyBSYW5nZShcblx0XHRcdG1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSxcblx0XHRcdENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdFx0bW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdClcblx0XTtcbn1cblxuY2xhc3MgTGluZVJhbmdlIHtcblx0cHVibGljIGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZUNvdW50OiBudW1iZXJcblx0KSB7IH1cblxuXHRwdWJsaWMgZ2V0IGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubGluZUNvdW50ID09PSAwO1xuXHR9XG5cblx0cHVibGljIGdldCBlbmRMaW5lTnVtYmVyRXhjbHVzaXZlKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhcnRMaW5lTnVtYmVyICsgdGhpcy5saW5lQ291bnQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlTGluZURlbGV0aW9uKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkTGluZU51bWJlcjogbnVtYmVyKTogSUxpbmVDaGFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBlbmRMaW5lTnVtYmVyLFxuXHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBtb2RpZmllZExpbmVOdW1iZXIsXG5cdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiAwLFxuXHRcdGNoYXJDaGFuZ2VzOiB1bmRlZmluZWRcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGluZUluc2VydGlvbihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBvcmlnaW5hbExpbmVOdW1iZXI6IG51bWJlcik6IElMaW5lQ2hhbmdlIHtcblx0cmV0dXJuIHtcblx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogb3JpZ2luYWxMaW5lTnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogMCxcblx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRjaGFyQ2hhbmdlczogdW5kZWZpbmVkXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpbmVDaGFuZ2Uob3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlciwgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyLCBjaGFyQ2hhbmdlcz86IElDaGFyQ2hhbmdlW10pOiBJTGluZUNoYW5nZSB7XG5cdHJldHVybiB7XG5cdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogb3JpZ2luYWxFbmRMaW5lTnVtYmVyLFxuXHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBtb2RpZmllZFN0YXJ0TGluZU51bWJlcixcblx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IG1vZGlmaWVkRW5kTGluZU51bWJlcixcblx0XHRjaGFyQ2hhbmdlczogY2hhckNoYW5nZXNcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ2hhckNoYW5nZShcblx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbjogbnVtYmVyLCBvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG51bWJlciwgb3JpZ2luYWxFbmRDb2x1bW46IG51bWJlcixcblx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyLCBtb2RpZmllZEVuZExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRFbmRDb2x1bW46IG51bWJlclxuKSB7XG5cdHJldHVybiB7XG5cdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLFxuXHRcdG9yaWdpbmFsU3RhcnRDb2x1bW46IG9yaWdpbmFsU3RhcnRDb2x1bW4sXG5cdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBvcmlnaW5hbEVuZExpbmVOdW1iZXIsXG5cdFx0b3JpZ2luYWxFbmRDb2x1bW46IG9yaWdpbmFsRW5kQ29sdW1uLFxuXHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBtb2RpZmllZFN0YXJ0TGluZU51bWJlcixcblx0XHRtb2RpZmllZFN0YXJ0Q29sdW1uOiBtb2RpZmllZFN0YXJ0Q29sdW1uLFxuXHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogbW9kaWZpZWRFbmRMaW5lTnVtYmVyLFxuXHRcdG1vZGlmaWVkRW5kQ29sdW1uOiBtb2RpZmllZEVuZENvbHVtblxuXHR9O1xufVxuXG5zdWl0ZSgnRWRpdG9yIERpZmYgLSBEaWZmQ29tcHV0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBpbnNlcnRpb25zXG5cblx0dGVzdCgnb25lIGluc2VydGVkIGxpbmUgYmVsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZScsICduZXcgbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVJbnNlcnRpb24oMiwgMiwgMSldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBpbnNlcnRlZCBsaW5lcyBiZWxvdycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lJywgJ25ldyBsaW5lJywgJ2Fub3RoZXIgbmV3IGxpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lSW5zZXJ0aW9uKDIsIDMsIDEpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgaW5zZXJ0ZWQgbGluZSBhYm92ZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWyduZXcgbGluZScsICdsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZUluc2VydGlvbigxLCAxLCAwKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGluc2VydGVkIGxpbmVzIGFib3ZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ25ldyBsaW5lJywgJ2Fub3RoZXIgbmV3IGxpbmUnLCAnbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMiwgMCldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBpbnNlcnRlZCBsaW5lIGluIG1pZGRsZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZTEnLCAnbGluZTInLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZTEnLCAnbGluZTInLCAnbmV3IGxpbmUnLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lSW5zZXJ0aW9uKDMsIDMsIDIpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gaW5zZXJ0ZWQgbGluZXMgaW4gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lMScsICdsaW5lMicsICdsaW5lMycsICdsaW5lNCddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lMScsICdsaW5lMicsICduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZUluc2VydGlvbigzLCA0LCAyKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGluc2VydGVkIGxpbmVzIGluIG1pZGRsZSBpbnRlcnJ1cHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZTEnLCAnbGluZTInLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZTEnLCAnbGluZTInLCAnbmV3IGxpbmUnLCAnbGluZTMnLCAnYW5vdGhlciBuZXcgbGluZScsICdsaW5lNCddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVJbnNlcnRpb24oMywgMywgMiksIGNyZWF0ZUxpbmVJbnNlcnRpb24oNSwgNSwgMyldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZGVsZXRpb25zXG5cblx0dGVzdCgnb25lIGRlbGV0ZWQgbGluZSBiZWxvdycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZScsICduZXcgbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZURlbGV0aW9uKDIsIDIsIDEpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZGVsZXRlZCBsaW5lcyBiZWxvdycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZScsICduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lRGVsZXRpb24oMiwgMywgMSldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBkZWxldGVkIGxpbmVzIGFib3ZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWyduZXcgbGluZScsICdsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lRGVsZXRpb24oMSwgMSwgMCldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBkZWxldGVkIGxpbmVzIGFib3ZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWyduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJywgJ2xpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVEZWxldGlvbigxLCAyLCAwKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnb25lIGRlbGV0ZWQgbGluZSBpbiBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ25ldyBsaW5lJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZURlbGV0aW9uKDMsIDMsIDIpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZGVsZXRlZCBsaW5lcyBpbiBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ25ldyBsaW5lJywgJ2Fub3RoZXIgbmV3IGxpbmUnLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZTEnLCAnbGluZTInLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lRGVsZXRpb24oMywgNCwgMildO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBkZWxldGVkIGxpbmVzIGluIG1pZGRsZSBpbnRlcnJ1cHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZTEnLCAnbGluZTInLCAnbmV3IGxpbmUnLCAnbGluZTMnLCAnYW5vdGhlciBuZXcgbGluZScsICdsaW5lNCddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lMScsICdsaW5lMicsICdsaW5lMycsICdsaW5lNCddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVEZWxldGlvbigzLCAzLCAyKSwgY3JlYXRlTGluZURlbGV0aW9uKDUsIDUsIDMpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIGNoYW5nZXNcblxuXHR0ZXN0KCdvbmUgbGluZSBjaGFuZ2VkOiBjaGFycyBpbnNlcnRlZCBhdCB0aGUgZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUgY2hhbmdlZCddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgNSwgMSwgNSwgMSwgNSwgMSwgMTMpXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnb25lIGxpbmUgY2hhbmdlZDogY2hhcnMgaW5zZXJ0ZWQgYXQgdGhlIGJlZ2lubmluZycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydteSBsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCAxLCAxLCAxLCAxLCAxLCAxLCA0KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBsaW5lIGNoYW5nZWQ6IGNoYXJzIGluc2VydGVkIGluIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiYmEnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnYWJ6emJhJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCAzLCAxLCAzLCAxLCAzLCAxLCA1KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBsaW5lIGNoYW5nZWQ6IGNoYXJzIGluc2VydGVkIGluIHRoZSBtaWRkbGUgKHR3byBzcG90cyknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiYmEnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnYWJ6emJ6emEnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMSwgMSwgMSwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDMsIDEsIDMsIDEsIDMsIDEsIDUpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDQsIDEsIDQsIDEsIDYsIDEsIDgpXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnb25lIGxpbmUgY2hhbmdlZDogY2hhcnMgZGVsZXRlZCAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmNkZWZnJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2FiY2ZnJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA0LCAxLCA2LCAxLCA0LCAxLCA0KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBsaW5lIGNoYW5nZWQ6IGNoYXJzIGRlbGV0ZWQgMicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnYWJjZGVmZyddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydhY2ZnJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCAyLCAxLCAzLCAxLCAyLCAxLCAyKSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA0LCAxLCA2LCAxLCAzLCAxLCAzKVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBsaW5lcyBjaGFuZ2VkIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiY2QnLCAnZWZnaCddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydhYmN6J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDIsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA0LCAyLCA1LCAxLCA0LCAxLCA1KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBsaW5lcyBjaGFuZ2VkIDInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2ZvbycsICdhYmNkJywgJ2VmZ2gnLCAnQkFSJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2ZvbycsICdhYmN6JywgJ0JBUiddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgyLCAzLCAyLCAyLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgNCwgMywgNSwgMiwgNCwgMiwgNSlcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gbGluZXMgY2hhbmdlZCAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydmb28nLCAnYWJjZCcsICdlZmdoJywgJ0JBUiddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydmb28nLCAnYWJjeicsICd6enp6ZWZnaCcsICdCQVInXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMiwgMywgMiwgMywgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDQsIDIsIDUsIDIsIDQsIDIsIDUpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDMsIDEsIDMsIDEsIDMsIDEsIDMsIDUpXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGxpbmVzIGNoYW5nZWQgNCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnYWJjJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJycsICcnLCAnYXhjJywgJyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCA0LCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMSwgMSwgMSwgMSwgMSwgMywgMSksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMiwgMSwgMywgMywgMiwgMywgMyksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgNCwgMSwgNCwgMywgNCwgNCwgMSlcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBvcmlnaW5hbCBzZXF1ZW5jZSBpbiBjaGFyIGRpZmYnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiYycsICcnLCAneHl6J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2FiYycsICdxd2UnLCAncnR5JywgJ3h5eiddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgyLCAyLCAyLCAzKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWUgbGluZXMgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnZm9vJywgJ2FiY2QnLCAnZWZnaCcsICdCQVInXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnZm9vJywgJ3p6emVmZ2gnLCAneHh4JywgJ0JBUiddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgyLCAzLCAyLCAzLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMSwgMywgMSwgMiwgMSwgMiwgNCksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMywgNSwgMywgNSwgMiwgOCwgMywgNCksXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnYmlnIGNoYW5nZSBwYXJ0IDEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2ZvbycsICdhYmNkJywgJ2VmZ2gnLCAnQkFSJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2hlbGxvJywgJ2ZvbycsICd6enplZmdoJywgJ3h4eCcsICdCQVInXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMSwgMCksXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDIsIDMsIDMsIDQsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAxLCAzLCAxLCAzLCAxLCAzLCA0KSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgzLCA1LCAzLCA1LCAzLCA4LCA0LCA0KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JpZyBjaGFuZ2UgcGFydCAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydmb28nLCAnYWJjZCcsICdlZmdoJywgJ0JBUicsICdSQUInXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnaGVsbG8nLCAnZm9vJywgJ3p6emVmZ2gnLCAneHh4JywgJ0JBUiddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUluc2VydGlvbigxLCAxLCAwKSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMiwgMywgMywgNCwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDEsIDMsIDEsIDMsIDEsIDMsIDQpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDMsIDUsIDMsIDUsIDMsIDgsIDQsIDQpXG5cdFx0XHRdKSxcblx0XHRcdGNyZWF0ZUxpbmVEZWxldGlvbig1LCA1LCA1KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhciBjaGFuZ2UgcG9zdHByb2Nlc3NpbmcgbWVyZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmJhJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2F6enpienp6Ynp6emEnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMSwgMSwgMSwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDIsIDEsIDQsIDEsIDIsIDEsIDEzKVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZSB0cmltIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ1xcdFxcdCBmb28gJywgJ2FiY2QnLCAnZWZnaCcsICdcXHRcXHQgQkFSXFx0XFx0J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJyAgaGVsbG9cXHQnLCAnXFx0IGZvbyAgIFxcdCcsICd6enplZmdoJywgJ3h4eCcsICcgICBCQVIgICBcXHQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMSwgMCksXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDIsIDMsIDMsIDQsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAxLCAyLCA1LCAzLCAxLCAzLCA0KSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgzLCA1LCAzLCA1LCA0LCAxLCA0LCA0KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIxMjIgci5oYXNPd25Qcm9wZXJ0eSBpcyBub3QgYSBmdW5jdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnaGFzT3duUHJvcGVydHknXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnaGFzT3duUHJvcGVydHknLCAnYW5kIGFub3RoZXIgbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUluc2VydGlvbigyLCAyLCAxKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgZGlmZiAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWycnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnc29tZXRoaW5nJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIHVuZGVmaW5lZClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBkaWZmIDInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJyddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydzb21ldGhpbmcnLCAnc29tZXRoaW5nIGVsc2UnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMSwgMSwgMiwgdW5kZWZpbmVkKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGRpZmYgMycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnc29tZXRoaW5nJywgJ3NvbWV0aGluZyBlbHNlJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAyLCAxLCAxLCB1bmRlZmluZWQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgZGlmZiA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydzb21ldGhpbmcnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIHVuZGVmaW5lZClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBkaWZmIDUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJyddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWycnXTtcblx0XHRjb25zdCBleHBlY3RlZDogSUxpbmVDaGFuZ2VbXSA9IFtdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV0dHkgZGlmZiAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0J3N1aXRlKGZ1bmN0aW9uICgpIHsnLFxuXHRcdFx0J1x0dGVzdDEoKSB7Jyxcblx0XHRcdCdcdFx0YXNzZXJ0Lm9rKHRydWUpOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0dGVzdDIoKSB7Jyxcblx0XHRcdCdcdFx0YXNzZXJ0Lm9rKHRydWUpOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCd9KTsnLFxuXHRcdFx0JycsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCcvLyBBbiBpbnNlcnRpb24nLFxuXHRcdFx0J3N1aXRlKGZ1bmN0aW9uICgpIHsnLFxuXHRcdFx0J1x0dGVzdDEoKSB7Jyxcblx0XHRcdCdcdFx0YXNzZXJ0Lm9rKHRydWUpOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0dGVzdDIoKSB7Jyxcblx0XHRcdCdcdFx0YXNzZXJ0Lm9rKHRydWUpOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0dGVzdDMoKSB7Jyxcblx0XHRcdCdcdFx0YXNzZXJ0Lm9rKHRydWUpOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCd9KTsnLFxuXHRcdFx0JycsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMSwgMCksXG5cdFx0XHRjcmVhdGVMaW5lSW5zZXJ0aW9uKDEwLCAxMywgOClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV0dHkgZGlmZiAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0Jy8vIEp1c3QgYSBjb21tZW50Jyxcblx0XHRcdCcnLFxuXHRcdFx0J2Z1bmN0aW9uIGNvbXB1dGUoYSwgYiwgYywgZCkgeycsXG5cdFx0XHQnXHRpZiAoYSkgeycsXG5cdFx0XHQnXHRcdGlmIChiKSB7Jyxcblx0XHRcdCdcdFx0XHRpZiAoYykgeycsXG5cdFx0XHQnXHRcdFx0XHRyZXR1cm4gNTsnLFxuXHRcdFx0J1x0XHRcdH0nLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdFx0Ly8gVGhlc2UgbmV4dCBsaW5lcyB3aWxsIGJlIGRlbGV0ZWQnLFxuXHRcdFx0J1x0XHRpZiAoZCkgeycsXG5cdFx0XHQnXHRcdFx0cmV0dXJuIC0xOycsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0XHRyZXR1cm4gMDsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCcvLyBIZXJlIGlzIGFuIGluc2VydGVkIGxpbmUnLFxuXHRcdFx0Jy8vIGFuZCBhbm90aGVyIGluc2VydGVkIGxpbmUnLFxuXHRcdFx0Jy8vIGFuZCBhbm90aGVyIG9uZScsXG5cdFx0XHQnLy8gSnVzdCBhIGNvbW1lbnQnLFxuXHRcdFx0JycsXG5cdFx0XHQnZnVuY3Rpb24gY29tcHV0ZShhLCBiLCBjLCBkKSB7Jyxcblx0XHRcdCdcdGlmIChhKSB7Jyxcblx0XHRcdCdcdFx0aWYgKGIpIHsnLFxuXHRcdFx0J1x0XHRcdGlmIChjKSB7Jyxcblx0XHRcdCdcdFx0XHRcdHJldHVybiA1OycsXG5cdFx0XHQnXHRcdFx0fScsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0XHRyZXR1cm4gMDsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMywgMCksXG5cdFx0XHRjcmVhdGVMaW5lRGVsZXRpb24oMTAsIDEzLCAxMiksXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJldHR5IGRpZmYgMycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCdjbGFzcyBBIHsnLFxuXHRcdFx0J1x0LyoqJyxcblx0XHRcdCdcdCAqIG0xJyxcblx0XHRcdCdcdCAqLycsXG5cdFx0XHQnXHRtZXRob2QxKCkge30nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHQvKionLFxuXHRcdFx0J1x0ICogbTMnLFxuXHRcdFx0J1x0ICovJyxcblx0XHRcdCdcdG1ldGhvZDMoKSB7fScsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdjbGFzcyBBIHsnLFxuXHRcdFx0J1x0LyoqJyxcblx0XHRcdCdcdCAqIG0xJyxcblx0XHRcdCdcdCAqLycsXG5cdFx0XHQnXHRtZXRob2QxKCkge30nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHQvKionLFxuXHRcdFx0J1x0ICogbTInLFxuXHRcdFx0J1x0ICovJyxcblx0XHRcdCdcdG1ldGhvZDIoKSB7fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdC8qKicsXG5cdFx0XHQnXHQgKiBtMycsXG5cdFx0XHQnXHQgKi8nLFxuXHRcdFx0J1x0bWV0aG9kMygpIHt9Jyxcblx0XHRcdCd9Jyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUluc2VydGlvbig3LCAxMSwgNilcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM2MzYnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnaWYoIVRleHREcmF3TG9hZFtwbGF5ZXJpZF0pJyxcblx0XHRcdCd7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzNdKTsnLFxuXHRcdFx0J1x0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzRdKTsnLFxuXHRcdFx0J1x0aWYoIUFwcGxlSm9iVHJlZXNUeXBlW0FwcGxlSm9iVHJlZXNQbGF5ZXJOdW1bcGxheWVyaWRdXSknLFxuXHRcdFx0J1x0eycsXG5cdFx0XHQnXHRcdGZvcihuZXcgaT0wO2k8MTA7aSsrKSBpZihTdGF0dXNURF9BcHBsZUpvYkFwcGxlc1twbGF5ZXJpZF1baV0pIFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYls1K2ldKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnXHRlbHNlJyxcblx0XHRcdCdcdHsnLFxuXHRcdFx0J1x0XHRmb3IobmV3IGk9MDtpPDEwO2krKykgaWYoU3RhdHVzVERfQXBwbGVKb2JBcHBsZXNbcGxheWVyaWRdW2ldKSBUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMTUraV0pOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCdlbHNlJyxcblx0XHRcdCd7Jyxcblx0XHRcdCdcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlszXSk7Jyxcblx0XHRcdCdcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlsyN10pOycsXG5cdFx0XHQnXHRpZighQXBwbGVKb2JUcmVlc1R5cGVbQXBwbGVKb2JUcmVlc1BsYXllck51bVtwbGF5ZXJpZF1dKScsXG5cdFx0XHQnXHR7Jyxcblx0XHRcdCdcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzI4K2ldKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnXHRlbHNlJyxcblx0XHRcdCdcdHsnLFxuXHRcdFx0J1x0XHRmb3IobmV3IGk9MDtpPDEwO2krKykgaWYoU3RhdHVzVERfQXBwbGVKb2JBcHBsZXNbcGxheWVyaWRdW2ldKSBUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMzgraV0pOycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCd9Jyxcblx0XHRdO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gW1xuXHRcdFx0J1x0aWYoIVRleHREcmF3TG9hZFtwbGF5ZXJpZF0pJyxcblx0XHRcdCdcdHsnLFxuXHRcdFx0J1x0Jyxcblx0XHRcdCdcdFx0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzNdKTsnLFxuXHRcdFx0J1x0XHRUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbNF0pOycsXG5cdFx0XHQnXHRcdGlmKCFBcHBsZUpvYlRyZWVzVHlwZVtBcHBsZUpvYlRyZWVzUGxheWVyTnVtW3BsYXllcmlkXV0pJyxcblx0XHRcdCdcdFx0eycsXG5cdFx0XHQnXHRcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzUraV0pOycsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0XHRlbHNlJyxcblx0XHRcdCdcdFx0eycsXG5cdFx0XHQnXHRcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzE1K2ldKTsnLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0ZWxzZScsXG5cdFx0XHQnXHR7Jyxcblx0XHRcdCdcdFx0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzNdKTsnLFxuXHRcdFx0J1x0XHRUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMjddKTsnLFxuXHRcdFx0J1x0XHRpZighQXBwbGVKb2JUcmVlc1R5cGVbQXBwbGVKb2JUcmVlc1BsYXllck51bVtwbGF5ZXJpZF1dKScsXG5cdFx0XHQnXHRcdHsnLFxuXHRcdFx0J1x0XHRcdGZvcihuZXcgaT0wO2k8MTA7aSsrKSBpZihTdGF0dXNURF9BcHBsZUpvYkFwcGxlc1twbGF5ZXJpZF1baV0pIFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlsyOCtpXSk7Jyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnXHRcdGVsc2UnLFxuXHRcdFx0J1x0XHR7Jyxcblx0XHRcdCdcdFx0XHRmb3IobmV3IGk9MDtpPDEwO2krKykgaWYoU3RhdHVzVERfQXBwbGVKb2JBcHBsZXNbcGxheWVyaWRdW2ldKSBUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMzgraV0pOycsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0fScsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDEsIDI3LCAxLCAyNyxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMSwgMSwgMSwgMSwgMSwgMSwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAxLCAyLCAxLCAyLCAxLCAyLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDMsIDEsIDMsIDEsIDMsIDEsIDMsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoNCwgMSwgNCwgMSwgNCwgMSwgNCwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSg1LCAxLCA1LCAxLCA1LCAxLCA1LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDYsIDEsIDYsIDEsIDYsIDEsIDYsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoNywgMSwgNywgMSwgNywgMSwgNywgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSg4LCAxLCA4LCAxLCA4LCAxLCA4LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDksIDEsIDksIDEsIDksIDEsIDksIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTAsIDEsIDEwLCAxLCAxMCwgMSwgMTAsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTEsIDEsIDExLCAxLCAxMSwgMSwgMTEsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTIsIDEsIDEyLCAxLCAxMiwgMSwgMTIsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTMsIDEsIDEzLCAxLCAxMywgMSwgMTMsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTQsIDEsIDE0LCAxLCAxNCwgMSwgMTQsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTUsIDEsIDE1LCAxLCAxNSwgMSwgMTUsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTYsIDEsIDE2LCAxLCAxNiwgMSwgMTYsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTcsIDEsIDE3LCAxLCAxNywgMSwgMTcsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTgsIDEsIDE4LCAxLCAxOCwgMSwgMTgsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMTksIDEsIDE5LCAxLCAxOSwgMSwgMTksIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjAsIDEsIDIwLCAxLCAyMCwgMSwgMjAsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjEsIDEsIDIxLCAxLCAyMSwgMSwgMjEsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjIsIDEsIDIyLCAxLCAyMiwgMSwgMjIsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjMsIDEsIDIzLCAxLCAyMywgMSwgMjMsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjQsIDEsIDI0LCAxLCAyNCwgMSwgMjQsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjUsIDEsIDI1LCAxLCAyNSwgMSwgMjUsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjYsIDEsIDI2LCAxLCAyNiwgMSwgMjYsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMjcsIDEsIDI3LCAxLCAyNywgMSwgMjcsIDIpLFxuXHRcdFx0XHRdXG5cdFx0XHQpXG5cdFx0XHQvLyBjcmVhdGVMaW5lSW5zZXJ0aW9uKDcsIDExLCA2KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MzkyMicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCcgKiBgeWFybiBbaW5zdGFsbF1gIC0tIEluc3RhbGwgcHJvamVjdCBOUE0gZGVwZW5kZW5jaWVzLiBUaGlzIGlzIGF1dG9tYXRpY2FsbHkgZG9uZSB3aGVuIHlvdSBmaXJzdCBjcmVhdGUgdGhlIHByb2plY3QuIFlvdSBzaG91bGQgb25seSBuZWVkIHRvIHJ1biB0aGlzIGlmIHlvdSBhZGQgZGVwZW5kZW5jaWVzIGluIGBwYWNrYWdlLmpzb25gLicsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCcgKiBgeWFybmAgLS0gSW5zdGFsbCBwcm9qZWN0IE5QTSBkZXBlbmRlbmNpZXMuIFlvdSBzaG91bGQgb25seSBuZWVkIHRvIHJ1biB0aGlzIGlmIHlvdSBhZGQgZGVwZW5kZW5jaWVzIGluIGBwYWNrYWdlLmpzb25gLicsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDEsIDEsIDEsIDEsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDksIDEsIDE5LCAxLCA5LCAxLCA5KSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDU4LCAxLCAxMjAsIDEsIDQ4LCAxLCA0OCksXG5cdFx0XHRcdF1cblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDI3NTEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnICAgIDEnLFxuXHRcdFx0JyAgMicsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCcgICAgMScsXG5cdFx0XHQnICAgMycsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDIsIDIsIDIsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDMsIDIsIDQsIDIsIDMsIDIsIDUpXG5cdFx0XHRcdF1cblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBnaXZlIGNoYXJhY3RlciBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0JyAgICAxJyxcblx0XHRcdCcgIDInLFxuXHRcdFx0J0EnLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnICAgIDEnLFxuXHRcdFx0JyAgIDMnLFxuXHRcdFx0JyBBJyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMywgMiwgM1xuXHRcdFx0KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ0NDIyOiBMZXNzIHRoYW4gaWRlYWwgZGlmZiByZXN1bHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0J2V4cG9ydCBjbGFzcyBDIHsnLFxuXHRcdFx0JycsXG5cdFx0XHQnXHRwdWJsaWMgbTEoKTogdm9pZCB7Jyxcblx0XHRcdCdcdFx0eycsXG5cdFx0XHQnXHRcdC8vMicsXG5cdFx0XHQnXHRcdC8vMycsXG5cdFx0XHQnXHRcdC8vNCcsXG5cdFx0XHQnXHRcdC8vNScsXG5cdFx0XHQnXHRcdC8vNicsXG5cdFx0XHQnXHRcdC8vNycsXG5cdFx0XHQnXHRcdC8vOCcsXG5cdFx0XHQnXHRcdC8vOScsXG5cdFx0XHQnXHRcdC8vMTAnLFxuXHRcdFx0J1x0XHQvLzExJyxcblx0XHRcdCdcdFx0Ly8xMicsXG5cdFx0XHQnXHRcdC8vMTMnLFxuXHRcdFx0J1x0XHQvLzE0Jyxcblx0XHRcdCdcdFx0Ly8xNScsXG5cdFx0XHQnXHRcdC8vMTYnLFxuXHRcdFx0J1x0XHQvLzE3Jyxcblx0XHRcdCdcdFx0Ly8xOCcsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHB1YmxpYyBtMigpOiB2b2lkIHsnLFxuXHRcdFx0J1x0XHRpZiAoYSkgeycsXG5cdFx0XHQnXHRcdFx0aWYgKGIpIHsnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BMScsXG5cdFx0XHQnXHRcdFx0XHQvL0EyJyxcblx0XHRcdCdcdFx0XHRcdC8vQTMnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BNCcsXG5cdFx0XHQnXHRcdFx0XHQvL0E1Jyxcblx0XHRcdCdcdFx0XHRcdC8vQTYnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BNycsXG5cdFx0XHQnXHRcdFx0XHQvL0E4Jyxcblx0XHRcdCdcdFx0XHR9Jyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdFx0Ly9BOScsXG5cdFx0XHQnXHRcdC8vQTEwJyxcblx0XHRcdCdcdFx0Ly9BMTEnLFxuXHRcdFx0J1x0XHQvL0ExMicsXG5cdFx0XHQnXHRcdC8vQTEzJyxcblx0XHRcdCdcdFx0Ly9BMTQnLFxuXHRcdFx0J1x0XHQvL0ExNScsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0cHVibGljIG0zKCk6IHZvaWQgeycsXG5cdFx0XHQnXHRcdGlmIChhKSB7Jyxcblx0XHRcdCdcdFx0XHQvL0IxJyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnXHRcdC8vQjInLFxuXHRcdFx0J1x0XHQvL0IzJyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHRwdWJsaWMgbTQoKTogYm9vbGVhbiB7Jyxcblx0XHRcdCdcdFx0Ly8xJyxcblx0XHRcdCdcdFx0Ly8yJyxcblx0XHRcdCdcdFx0Ly8zJyxcblx0XHRcdCdcdFx0Ly80Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0JycsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdleHBvcnQgY2xhc3MgQyB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0Y29uc3RydWN0b3IoKSB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0JycsXG5cdFx0XHQnJyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHB1YmxpYyBtMSgpOiB2b2lkIHsnLFxuXHRcdFx0J1x0XHR7Jyxcblx0XHRcdCdcdFx0Ly8yJyxcblx0XHRcdCdcdFx0Ly8zJyxcblx0XHRcdCdcdFx0Ly80Jyxcblx0XHRcdCdcdFx0Ly81Jyxcblx0XHRcdCdcdFx0Ly82Jyxcblx0XHRcdCdcdFx0Ly83Jyxcblx0XHRcdCdcdFx0Ly84Jyxcblx0XHRcdCdcdFx0Ly85Jyxcblx0XHRcdCdcdFx0Ly8xMCcsXG5cdFx0XHQnXHRcdC8vMTEnLFxuXHRcdFx0J1x0XHQvLzEyJyxcblx0XHRcdCdcdFx0Ly8xMycsXG5cdFx0XHQnXHRcdC8vMTQnLFxuXHRcdFx0J1x0XHQvLzE1Jyxcblx0XHRcdCdcdFx0Ly8xNicsXG5cdFx0XHQnXHRcdC8vMTcnLFxuXHRcdFx0J1x0XHQvLzE4Jyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0cHVibGljIG00KCk6IGJvb2xlYW4geycsXG5cdFx0XHQnXHRcdC8vMScsXG5cdFx0XHQnXHRcdC8vMicsXG5cdFx0XHQnXHRcdC8vMycsXG5cdFx0XHQnXHRcdC8vNCcsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQyLCAwLCAzLCA5XG5cdFx0XHQpLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MjUsIDU1LCAzMSwgMFxuXHRcdFx0KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2l2ZXMgcHJlZmVyZW5jZSB0byBtYXRjaGluZyBsb25nZXIgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnQScsXG5cdFx0XHQnQScsXG5cdFx0XHQnQkInLFxuXHRcdFx0J0MnLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnQScsXG5cdFx0XHQnQkInLFxuXHRcdFx0J0EnLFxuXHRcdFx0J0QnLFxuXHRcdFx0J0UnLFxuXHRcdFx0J0EnLFxuXHRcdFx0J0MnLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQyLCAyLCAxLCAwXG5cdFx0XHQpLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MywgMCwgMywgNlxuXHRcdFx0KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExOTA1MTogZ2l2ZXMgcHJlZmVyZW5jZSB0byBmZXdlciBkaWZmIGh1bmtzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0JzEnLFxuXHRcdFx0JycsXG5cdFx0XHQnJyxcblx0XHRcdCcyJyxcblx0XHRcdCcnLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnMScsXG5cdFx0XHQnJyxcblx0XHRcdCcxLjUnLFxuXHRcdFx0JycsXG5cdFx0XHQnJyxcblx0XHRcdCcyJyxcblx0XHRcdCcnLFxuXHRcdFx0JzMnLFxuXHRcdFx0JycsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDAsIDMsIDRcblx0XHRcdCksXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQ1LCAwLCA4LCA5XG5cdFx0XHQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIxNDM2OiBEaWZmIGNodW5rIGNvbnRhaW5zIGFuIHVuY2hhbmdlZCBsaW5lIHBhcnQgMScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCdpZiAoY29uZCkgeycsXG5cdFx0XHQnICAgIGNtZCcsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdpZiAoY29uZCkgeycsXG5cdFx0XHQnICAgIGlmIChvdGhlcl9jb25kKSB7Jyxcblx0XHRcdCcgICAgICAgIGNtZCcsXG5cdFx0XHQnICAgIH0nLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQxLCAwLCAyLCAyXG5cdFx0XHQpLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMCwgNCwgNFxuXHRcdFx0KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIxNDM2OiBEaWZmIGNodW5rIGNvbnRhaW5zIGFuIHVuY2hhbmdlZCBsaW5lIHBhcnQgMicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCdpZiAoY29uZCkgeycsXG5cdFx0XHQnICAgIGNtZCcsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdpZiAoY29uZCkgeycsXG5cdFx0XHQnICAgIGlmIChvdGhlcl9jb25kKSB7Jyxcblx0XHRcdCcgICAgICAgIGNtZCcsXG5cdFx0XHQnICAgIH0nLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQxLCAwLCAyLCAyXG5cdFx0XHQpLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMiwgMywgM1xuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDAsIDQsIDRcblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjk1NTI6IEFzc2VydGlvbiBlcnJvciB3aGVuIGhhdmluZyBib3RoIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UgZGlmZnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnaWYgVHJ1ZTonLFxuXHRcdFx0JyAgICBwcmludCgyKScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdpZiBUcnVlOicsXG5cdFx0XHQnXFx0cHJpbnQoMikgJyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMiwgMiwgMixcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMSwgMiwgNSwgMiwgMSwgMiwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAxMywgMiwgMTMsIDIsIDEwLCAyLCAxMSksXG5cdFx0XHRcdF1cblx0XHRcdCksXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FB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Q0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEIsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO0FBQUEsSUFDN0I7QUFDQSxlQUFXLFVBQVUsVUFBVSxVQUFVLE1BQU0sT0FBTyxJQUFJO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUFJO0FBQUEsUUFBRztBQUFBLFFBQ1Y7QUFBQSxVQUNDLGlCQUFpQixHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUN2QyxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDdkMsaUJBQWlCLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3ZDLGlCQUFpQixHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUN2QyxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDdkMsaUJBQWlCLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3ZDLGlCQUFpQixHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUN2QyxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDdkMsaUJBQWlCLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3ZDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFFBQzVDO0FBQUEsTUFDRDtBQUFBO0FBQUEsSUFFRDtBQUNBLGVBQVcsVUFBVSxVQUFVLFVBQVUsTUFBTSxNQUFNLEtBQUs7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0M7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUNUO0FBQUEsVUFDQyxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDeEMsaUJBQWlCLEdBQUcsSUFBSSxHQUFHLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzdDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxlQUFXLFVBQVUsVUFBVSxVQUFVLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0M7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUNUO0FBQUEsVUFDQyxpQkFBaUIsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGVBQVcsVUFBVSxVQUFVLFVBQVUsTUFBTSxNQUFNLEtBQUs7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxRQUNDO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFDQSxlQUFXLFVBQVUsVUFBVSxVQUFVLE9BQU8sT0FBTyxLQUFLO0FBQUEsRUFDN0QsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBQ0EsZUFBVyxVQUFVLFVBQVUsVUFBVSxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQ0EsZUFBVyxVQUFVLFVBQVUsVUFBVSxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFL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
