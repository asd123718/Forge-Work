import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { RenderedLinesCollection } from "../../../browser/view/viewLayer.js";
class TestLine {
  constructor(id) {
    this.id = id;
    this._pinged = false;
  }
  onContentChanged() {
    this._pinged = true;
  }
  onTokensChanged() {
    this._pinged = true;
  }
}
function assertState(col, state) {
  const actualState = {
    startLineNumber: col.getStartLineNumber(),
    lines: [],
    pinged: []
  };
  for (let lineNumber = col.getStartLineNumber(); lineNumber <= col.getEndLineNumber(); lineNumber++) {
    actualState.lines.push(col.getLine(lineNumber).id);
    actualState.pinged.push(col.getLine(lineNumber)._pinged);
  }
  assert.deepStrictEqual(actualState, state);
}
suite("RenderedLinesCollection onLinesDeleted", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLinesDeleted(deleteFromLineNumber, deleteToLineNumber, expectedDeleted, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualDeleted1 = col.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
    let actualDeleted = [];
    if (actualDeleted1) {
      actualDeleted = actualDeleted1.map((line) => line.id);
    }
    assert.deepStrictEqual(actualDeleted, expectedDeleted);
    assertState(col, expectedState);
  }
  test("A1", () => {
    testOnModelLinesDeleted(3, 3, [], {
      startLineNumber: 5,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A2", () => {
    testOnModelLinesDeleted(3, 4, [], {
      startLineNumber: 4,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A3", () => {
    testOnModelLinesDeleted(3, 5, [], {
      startLineNumber: 3,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A4", () => {
    testOnModelLinesDeleted(3, 6, ["old6"], {
      startLineNumber: 3,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("A5", () => {
    testOnModelLinesDeleted(3, 7, ["old6", "old7"], {
      startLineNumber: 3,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("A6", () => {
    testOnModelLinesDeleted(3, 8, ["old6", "old7", "old8"], {
      startLineNumber: 3,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("A7", () => {
    testOnModelLinesDeleted(3, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 3,
      lines: [],
      pinged: []
    });
  });
  test("A8", () => {
    testOnModelLinesDeleted(3, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 3,
      lines: [],
      pinged: []
    });
  });
  test("B1", () => {
    testOnModelLinesDeleted(5, 5, [], {
      startLineNumber: 5,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B2", () => {
    testOnModelLinesDeleted(5, 6, ["old6"], {
      startLineNumber: 5,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("B3", () => {
    testOnModelLinesDeleted(5, 7, ["old6", "old7"], {
      startLineNumber: 5,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("B4", () => {
    testOnModelLinesDeleted(5, 8, ["old6", "old7", "old8"], {
      startLineNumber: 5,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("B5", () => {
    testOnModelLinesDeleted(5, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 5,
      lines: [],
      pinged: []
    });
  });
  test("B6", () => {
    testOnModelLinesDeleted(5, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 5,
      lines: [],
      pinged: []
    });
  });
  test("C1", () => {
    testOnModelLinesDeleted(6, 6, ["old6"], {
      startLineNumber: 6,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("C2", () => {
    testOnModelLinesDeleted(6, 7, ["old6", "old7"], {
      startLineNumber: 6,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("C3", () => {
    testOnModelLinesDeleted(6, 8, ["old6", "old7", "old8"], {
      startLineNumber: 6,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("C4", () => {
    testOnModelLinesDeleted(6, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: [],
      pinged: []
    });
  });
  test("C5", () => {
    testOnModelLinesDeleted(6, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: [],
      pinged: []
    });
  });
  test("D1", () => {
    testOnModelLinesDeleted(7, 7, ["old7"], {
      startLineNumber: 6,
      lines: ["old6", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("D2", () => {
    testOnModelLinesDeleted(7, 8, ["old7", "old8"], {
      startLineNumber: 6,
      lines: ["old6", "old9"],
      pinged: [false, false]
    });
  });
  test("D3", () => {
    testOnModelLinesDeleted(7, 9, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("D4", () => {
    testOnModelLinesDeleted(7, 10, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("E1", () => {
    testOnModelLinesDeleted(8, 8, ["old8"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old9"],
      pinged: [false, false, false]
    });
  });
  test("E2", () => {
    testOnModelLinesDeleted(8, 9, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("E3", () => {
    testOnModelLinesDeleted(8, 10, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("F1", () => {
    testOnModelLinesDeleted(9, 9, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("F2", () => {
    testOnModelLinesDeleted(9, 10, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("G1", () => {
    testOnModelLinesDeleted(10, 10, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("G2", () => {
    testOnModelLinesDeleted(10, 11, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("H1", () => {
    testOnModelLinesDeleted(11, 13, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onLineChanged", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLineChanged(changedLineNumber, expectedPinged, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualPinged = col.onLinesChanged(changedLineNumber, 1);
    assert.deepStrictEqual(actualPinged, expectedPinged);
    assertState(col, expectedState);
  }
  test("3", () => {
    testOnModelLineChanged(3, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("4", () => {
    testOnModelLineChanged(4, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("5", () => {
    testOnModelLineChanged(5, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("6", () => {
    testOnModelLineChanged(6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("7", () => {
    testOnModelLineChanged(7, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, true, false, false]
    });
  });
  test("8", () => {
    testOnModelLineChanged(8, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, false]
    });
  });
  test("9", () => {
    testOnModelLineChanged(9, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, true]
    });
  });
  test("10", () => {
    testOnModelLineChanged(10, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("11", () => {
    testOnModelLineChanged(11, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onLinesInserted", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLinesInserted(insertFromLineNumber, insertToLineNumber, expectedDeleted, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualDeleted1 = col.onLinesInserted(insertFromLineNumber, insertToLineNumber);
    let actualDeleted = [];
    if (actualDeleted1) {
      actualDeleted = actualDeleted1.map((line) => line.id);
    }
    assert.deepStrictEqual(actualDeleted, expectedDeleted);
    assertState(col, expectedState);
  }
  test("A1", () => {
    testOnModelLinesInserted(3, 3, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A2", () => {
    testOnModelLinesInserted(3, 4, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A3", () => {
    testOnModelLinesInserted(3, 5, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A4", () => {
    testOnModelLinesInserted(3, 6, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A5", () => {
    testOnModelLinesInserted(3, 7, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A6", () => {
    testOnModelLinesInserted(3, 8, [], {
      startLineNumber: 12,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A7", () => {
    testOnModelLinesInserted(3, 9, [], {
      startLineNumber: 13,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A8", () => {
    testOnModelLinesInserted(3, 10, [], {
      startLineNumber: 14,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B1", () => {
    testOnModelLinesInserted(5, 5, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B2", () => {
    testOnModelLinesInserted(5, 6, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B3", () => {
    testOnModelLinesInserted(5, 7, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B4", () => {
    testOnModelLinesInserted(5, 8, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B5", () => {
    testOnModelLinesInserted(5, 9, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B6", () => {
    testOnModelLinesInserted(5, 10, [], {
      startLineNumber: 12,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C1", () => {
    testOnModelLinesInserted(6, 6, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C2", () => {
    testOnModelLinesInserted(6, 7, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C3", () => {
    testOnModelLinesInserted(6, 8, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C4", () => {
    testOnModelLinesInserted(6, 9, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C5", () => {
    testOnModelLinesInserted(6, 10, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("D1", () => {
    testOnModelLinesInserted(7, 7, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "new", "old7", "old8"],
      pinged: [false, false, false, false]
    });
  });
  test("D2", () => {
    testOnModelLinesInserted(7, 8, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "new", "new", "old7"],
      pinged: [false, false, false, false]
    });
  });
  test("D3", () => {
    testOnModelLinesInserted(7, 9, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("D4", () => {
    testOnModelLinesInserted(7, 10, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("E1", () => {
    testOnModelLinesInserted(8, 8, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "new", "old8"],
      pinged: [false, false, false, false]
    });
  });
  test("E2", () => {
    testOnModelLinesInserted(8, 9, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("E3", () => {
    testOnModelLinesInserted(8, 10, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("F1", () => {
    testOnModelLinesInserted(9, 9, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("F2", () => {
    testOnModelLinesInserted(9, 10, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("G1", () => {
    testOnModelLinesInserted(10, 10, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("G2", () => {
    testOnModelLinesInserted(10, 11, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("H1", () => {
    testOnModelLinesInserted(11, 13, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onTokensChanged", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelTokensChanged(changedFromLineNumber, changedToLineNumber, expectedPinged, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualPinged = col.onTokensChanged([{ fromLineNumber: changedFromLineNumber, toLineNumber: changedToLineNumber }]);
    assert.deepStrictEqual(actualPinged, expectedPinged);
    assertState(col, expectedState);
  }
  test("A", () => {
    testOnModelTokensChanged(3, 3, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B", () => {
    testOnModelTokensChanged(3, 5, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C", () => {
    testOnModelTokensChanged(3, 6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("D", () => {
    testOnModelTokensChanged(6, 6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("E", () => {
    testOnModelTokensChanged(5, 10, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, true, true, true]
    });
  });
  test("F", () => {
    testOnModelTokensChanged(8, 9, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, true]
    });
  });
  test("G", () => {
    testOnModelTokensChanged(8, 11, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, true]
    });
  });
  test("H", () => {
    testOnModelTokensChanged(10, 10, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("I", () => {
    testOnModelTokensChanged(10, 11, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHZpZXdcXHZpZXdMYXllci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGluZSwgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXcvdmlld0xheWVyLmpzJztcblxuY2xhc3MgVGVzdExpbmUgaW1wbGVtZW50cyBJTGluZSB7XG5cblx0X3BpbmdlZCA9IGZhbHNlO1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgaWQ6IHN0cmluZykge1xuXHR9XG5cblx0b25Db250ZW50Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9waW5nZWQgPSB0cnVlO1xuXHR9XG5cdG9uVG9rZW5zQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9waW5nZWQgPSB0cnVlO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTGluZXNDb2xsZWN0aW9uU3RhdGUge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0bGluZXM6IHN0cmluZ1tdO1xuXHRwaW5nZWQ6IGJvb2xlYW5bXTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0U3RhdGUoY29sOiBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxUZXN0TGluZT4sIHN0YXRlOiBJTGluZXNDb2xsZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0Y29uc3QgYWN0dWFsU3RhdGU6IElMaW5lc0NvbGxlY3Rpb25TdGF0ZSA9IHtcblx0XHRzdGFydExpbmVOdW1iZXI6IGNvbC5nZXRTdGFydExpbmVOdW1iZXIoKSxcblx0XHRsaW5lczogW10sXG5cdFx0cGluZ2VkOiBbXVxuXHR9O1xuXHRmb3IgKGxldCBsaW5lTnVtYmVyID0gY29sLmdldFN0YXJ0TGluZU51bWJlcigpOyBsaW5lTnVtYmVyIDw9IGNvbC5nZXRFbmRMaW5lTnVtYmVyKCk7IGxpbmVOdW1iZXIrKykge1xuXHRcdGFjdHVhbFN0YXRlLmxpbmVzLnB1c2goY29sLmdldExpbmUobGluZU51bWJlcikuaWQpO1xuXHRcdGFjdHVhbFN0YXRlLnBpbmdlZC5wdXNoKGNvbC5nZXRMaW5lKGxpbmVOdW1iZXIpLl9waW5nZWQpO1xuXHR9XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsU3RhdGUsIHN0YXRlKTtcbn1cblxuc3VpdGUoJ1JlbmRlcmVkTGluZXNDb2xsZWN0aW9uIG9uTGluZXNEZWxldGVkJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcjogbnVtYmVyLCBleHBlY3RlZERlbGV0ZWQ6IHN0cmluZ1tdLCBleHBlY3RlZFN0YXRlOiBJTGluZXNDb2xsZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb2wgPSBuZXcgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VGVzdExpbmU+KHsgY3JlYXRlTGluZTogKCkgPT4gbmV3IFRlc3RMaW5lKCduZXcnKSB9KTtcblx0XHRjb2wuX3NldCg2LCBbXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDYnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNycpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ4JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDknKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbERlbGV0ZWQxID0gY29sLm9uTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXIpO1xuXHRcdGxldCBhY3R1YWxEZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChhY3R1YWxEZWxldGVkMSkge1xuXHRcdFx0YWN0dWFsRGVsZXRlZCA9IGFjdHVhbERlbGV0ZWQxLm1hcChsaW5lID0+IGxpbmUuaWQpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbERlbGV0ZWQsIGV4cGVjdGVkRGVsZXRlZCk7XG5cdFx0YXNzZXJ0U3RhdGUoY29sLCBleHBlY3RlZFN0YXRlKTtcblx0fVxuXG5cdHRlc3QoJ0ExJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDMsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMywgNCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNCxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBMycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCA1LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDYsIFsnb2xkNiddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDMsXG5cdFx0XHRsaW5lczogWydvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMywgNywgWydvbGQ2JywgJ29sZDcnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFsnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E2JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDgsIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFsnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E3JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDksIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDMsXG5cdFx0XHRsaW5lczogW10sXG5cdFx0XHRwaW5nZWQ6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E4JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDEwLCBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFtdLFxuXHRcdFx0cGluZ2VkOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0IxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDUsIDUsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNSwgNiwgWydvbGQ2J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNSxcblx0XHRcdGxpbmVzOiBbJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCMycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg1LCA3LCBbJ29sZDYnLCAnb2xkNyddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogWydvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNSwgOCwgWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogWydvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNSwgOSwgWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNSxcblx0XHRcdGxpbmVzOiBbXSxcblx0XHRcdHBpbmdlZDogW11cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjYnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNSwgMTAsIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogW10sXG5cdFx0XHRwaW5nZWQ6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnQzEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNiwgNiwgWydvbGQ2J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg2LCA3LCBbJ29sZDYnLCAnb2xkNyddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNiwgOCwgWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNiwgOSwgWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbXSxcblx0XHRcdHBpbmdlZDogW11cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNiwgMTAsIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogW10sXG5cdFx0XHRwaW5nZWQ6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRDEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNywgNywgWydvbGQ3J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg3LCA4LCBbJ29sZDcnLCAnb2xkOCddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRDMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNywgOSwgWydvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRDQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNywgMTAsIFsnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNiddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRTEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoOCwgOCwgWydvbGQ4J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg4LCA5LCBbJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRTMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoOCwgMTAsIFsnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNyddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0YxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDksIDksIFsnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRjInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoOSwgMTAsIFsnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdHMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgxMCwgMTAsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRzInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMTAsIDExLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnSDEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMTEsIDEzLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdSZW5kZXJlZExpbmVzQ29sbGVjdGlvbiBvbkxpbmVDaGFuZ2VkJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoY2hhbmdlZExpbmVOdW1iZXI6IG51bWJlciwgZXhwZWN0ZWRQaW5nZWQ6IGJvb2xlYW4sIGV4cGVjdGVkU3RhdGU6IElMaW5lc0NvbGxlY3Rpb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbCA9IG5ldyBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxUZXN0TGluZT4oeyBjcmVhdGVMaW5lOiAoKSA9PiBuZXcgVGVzdExpbmUoJ25ldycpIH0pO1xuXHRcdGNvbC5fc2V0KDYsIFtcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNicpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ3JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDgnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkOScpXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsUGluZ2VkID0gY29sLm9uTGluZXNDaGFuZ2VkKGNoYW5nZWRMaW5lTnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFBpbmdlZCwgZXhwZWN0ZWRQaW5nZWQpO1xuXHRcdGFzc2VydFN0YXRlKGNvbCwgZXhwZWN0ZWRTdGF0ZSk7XG5cdH1cblxuXHR0ZXN0KCczJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoMywgZmFsc2UsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnNCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDQsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lQ2hhbmdlZCg1LCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCc2JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoNiwgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzcnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lQ2hhbmdlZCg3LCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnOCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDgsIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCc5JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoOSwgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzEwJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoMTAsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzExJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoMTEsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb24gb25MaW5lc0luc2VydGVkJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZChpbnNlcnRGcm9tTGluZU51bWJlcjogbnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXI6IG51bWJlciwgZXhwZWN0ZWREZWxldGVkOiBzdHJpbmdbXSwgZXhwZWN0ZWRTdGF0ZTogSUxpbmVzQ29sbGVjdGlvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29sID0gbmV3IFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uPFRlc3RMaW5lPih7IGNyZWF0ZUxpbmU6ICgpID0+IG5ldyBUZXN0TGluZSgnbmV3JykgfSk7XG5cdFx0Y29sLl9zZXQoNiwgW1xuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ2JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDcnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkOCcpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ5Jylcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWxEZWxldGVkMSA9IGNvbC5vbkxpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXIsIGluc2VydFRvTGluZU51bWJlcik7XG5cdFx0bGV0IGFjdHVhbERlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGFjdHVhbERlbGV0ZWQxKSB7XG5cdFx0XHRhY3R1YWxEZWxldGVkID0gYWN0dWFsRGVsZXRlZDEubWFwKGxpbmUgPT4gbGluZS5pZCk7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsRGVsZXRlZCwgZXhwZWN0ZWREZWxldGVkKTtcblx0XHRhc3NlcnRTdGF0ZShjb2wsIGV4cGVjdGVkU3RhdGUpO1xuXHR9XG5cblx0dGVzdCgnQTEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDMsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDcsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDQsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDgsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDUsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDksXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDYsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCA3LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMSxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBNicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMywgOCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTIsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTcnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDksIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEzLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E4JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCAxMCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTQsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdCMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNSwgNSwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNyxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNSwgNiwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogOCxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCMycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNSwgNywgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogOSxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCNCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNSwgOCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDUsIDksIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDExLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0I2JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg1LCAxMCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTIsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdDMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNiwgNiwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNyxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNiwgNywgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogOCxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDMycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNiwgOCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogOSxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDNCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNiwgOSwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzUnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDYsIDEwLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMSxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0QxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg3LCA3LCBbJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICduZXcnLCAnb2xkNycsICdvbGQ4J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRDInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDcsIDgsIFsnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnbmV3JywgJ25ldycsICdvbGQ3J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRDMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDcsIDksIFsnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNiddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Q0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg3LCAxMCwgWydvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdFMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoOCwgOCwgWydvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICduZXcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0UyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg4LCA5LCBbJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRTMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDgsIDEwLCBbJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdGMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoOSwgOSwgWydvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoOSwgMTAsIFsnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdHMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMTAsIDEwLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0cyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgxMCwgMTEsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdIMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMTEsIDEzLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cblxuc3VpdGUoJ1JlbmRlcmVkTGluZXNDb2xsZWN0aW9uIG9uVG9rZW5zQ2hhbmdlZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoY2hhbmdlZEZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGNoYW5nZWRUb0xpbmVOdW1iZXI6IG51bWJlciwgZXhwZWN0ZWRQaW5nZWQ6IGJvb2xlYW4sIGV4cGVjdGVkU3RhdGU6IElMaW5lc0NvbGxlY3Rpb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbCA9IG5ldyBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxUZXN0TGluZT4oeyBjcmVhdGVMaW5lOiAoKSA9PiBuZXcgVGVzdExpbmUoJ25ldycpIH0pO1xuXHRcdGNvbC5fc2V0KDYsIFtcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNicpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ3JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDgnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkOScpXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsUGluZ2VkID0gY29sLm9uVG9rZW5zQ2hhbmdlZChbeyBmcm9tTGluZU51bWJlcjogY2hhbmdlZEZyb21MaW5lTnVtYmVyLCB0b0xpbmVOdW1iZXI6IGNoYW5nZWRUb0xpbmVOdW1iZXIgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsUGluZ2VkLCBleHBlY3RlZFBpbmdlZCk7XG5cdFx0YXNzZXJ0U3RhdGUoY29sLCBleHBlY3RlZFN0YXRlKTtcblx0fVxuXG5cdHRlc3QoJ0EnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKDMsIDMsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ0InLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKDMsIDUsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ0MnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKDMsIDYsIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW3RydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdEJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCg2LCA2LCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFt0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnRScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoNSwgMTAsIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW3RydWUsIHRydWUsIHRydWUsIHRydWVdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdGJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCg4LCA5LCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIHRydWUsIHRydWVdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdHJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCg4LCAxMSwgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCB0cnVlLCB0cnVlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnSCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoMTAsIDEwLCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdJJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCgxMCwgMTEsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFnQiwrQkFBK0I7QUFFL0MsTUFBTSxTQUEwQjtBQUFBLEVBRy9CLFlBQW1CLElBQVk7QUFBWjtBQURuQixtQkFBVTtBQUFBLEVBRVY7QUFBQSxFQUVBLG1CQUF5QjtBQUN4QixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBQ0Esa0JBQXdCO0FBQ3ZCLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQ0Q7QUFRQSxTQUFTLFlBQVksS0FBd0MsT0FBb0M7QUFDaEcsUUFBTSxjQUFxQztBQUFBLElBQzFDLGlCQUFpQixJQUFJLG1CQUFtQjtBQUFBLElBQ3hDLE9BQU8sQ0FBQztBQUFBLElBQ1IsUUFBUSxDQUFDO0FBQUEsRUFDVjtBQUNBLFdBQVMsYUFBYSxJQUFJLG1CQUFtQixHQUFHLGNBQWMsSUFBSSxpQkFBaUIsR0FBRyxjQUFjO0FBQ25HLGdCQUFZLE1BQU0sS0FBSyxJQUFJLFFBQVEsVUFBVSxF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
