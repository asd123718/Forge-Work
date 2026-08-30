import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { IntervalNode, IntervalTree, NodeColor, SENTINEL, getNodeColor, intervalCompare, nodeAcceptEdit, setNodeStickiness } from "../../../common/model/intervalTree.js";
const GENERATE_TESTS = false;
const TEST_COUNT = GENERATE_TESTS ? 1e4 : 0;
const PRINT_TREE = false;
const MIN_INTERVAL_START = 1;
const MAX_INTERVAL_END = 100;
const MIN_INSERTS = 1;
const MAX_INSERTS = 30;
const MIN_CHANGE_CNT = 10;
const MAX_CHANGE_CNT = 20;
suite("IntervalTree 1", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class Interval {
    constructor(start, end) {
      this._intervalBrand = void 0;
      this.start = start;
      this.end = end;
    }
  }
  class Oracle {
    constructor() {
      this.intervals = [];
    }
    insert(interval) {
      this.intervals.push(interval);
      this.intervals.sort((a, b) => {
        if (a.start === b.start) {
          return a.end - b.end;
        }
        return a.start - b.start;
      });
      return interval;
    }
    delete(interval) {
      for (let i = 0, len = this.intervals.length; i < len; i++) {
        if (this.intervals[i] === interval) {
          this.intervals.splice(i, 1);
          return;
        }
      }
    }
    search(interval) {
      const result = [];
      for (let i = 0, len = this.intervals.length; i < len; i++) {
        const int = this.intervals[i];
        if (int.start <= interval.end && int.end >= interval.start) {
          result.push(int);
        }
      }
      return result;
    }
  }
  class TestState {
    constructor() {
      this._oracle = new Oracle();
      this._tree = new IntervalTree();
      this._lastNodeId = -1;
      this._treeNodes = [];
      this._oracleNodes = [];
    }
    acceptOp(op) {
      if (op.type === "insert") {
        if (PRINT_TREE) {
          console.log(`insert: {${JSON.stringify(new Interval(op.begin, op.end))}}`);
        }
        const nodeId = ++this._lastNodeId;
        this._treeNodes[nodeId] = new IntervalNode(null, op.begin, op.end);
        this._tree.insert(this._treeNodes[nodeId]);
        this._oracleNodes[nodeId] = this._oracle.insert(new Interval(op.begin, op.end));
      } else if (op.type === "delete") {
        if (PRINT_TREE) {
          console.log(`delete: {${JSON.stringify(this._oracleNodes[op.id])}}`);
        }
        this._tree.delete(this._treeNodes[op.id]);
        this._oracle.delete(this._oracleNodes[op.id]);
        this._treeNodes[op.id] = null;
        this._oracleNodes[op.id] = null;
      } else if (op.type === "change") {
        this._tree.delete(this._treeNodes[op.id]);
        this._treeNodes[op.id].reset(0, op.begin, op.end, null);
        this._tree.insert(this._treeNodes[op.id]);
        this._oracle.delete(this._oracleNodes[op.id]);
        this._oracleNodes[op.id].start = op.begin;
        this._oracleNodes[op.id].end = op.end;
        this._oracle.insert(this._oracleNodes[op.id]);
      } else {
        const actualNodes = this._tree.intervalSearch(op.begin, op.end, 0, false, false, 0, false);
        const actual2 = actualNodes.map((n) => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
        const expected2 = this._oracle.search(new Interval(op.begin, op.end));
        assert.deepStrictEqual(actual2, expected2);
        return;
      }
      if (PRINT_TREE) {
        printTree(this._tree);
      }
      assertTreeInvariants(this._tree);
      const actual = this._tree.getAllInOrder().map((n) => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
      const expected = this._oracle.intervals;
      assert.deepStrictEqual(actual, expected);
    }
    getExistingNodeId(index) {
      let currIndex = -1;
      for (let i = 0; i < this._treeNodes.length; i++) {
        if (this._treeNodes[i] === null) {
          continue;
        }
        currIndex++;
        if (currIndex === index) {
          return i;
        }
      }
      throw new Error("unexpected");
    }
  }
  function testIntervalTree(ops) {
    const state = new TestState();
    for (let i = 0; i < ops.length; i++) {
      state.acceptOp(ops[i]);
    }
  }
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function getRandomRange(min, max) {
    const begin = getRandomInt(min, max);
    let length;
    if (getRandomInt(1, 10) <= 2) {
      length = getRandomInt(0, max - begin);
    } else {
      length = getRandomInt(0, Math.min(max - begin, 10));
    }
    return [begin, begin + length];
  }
  class AutoTest {
    constructor() {
      this._ops = [];
      this._state = new TestState();
      this._insertCnt = getRandomInt(MIN_INSERTS, MAX_INSERTS);
      this._changeCnt = getRandomInt(MIN_CHANGE_CNT, MAX_CHANGE_CNT);
      this._deleteCnt = 0;
    }
    _doRandomInsert() {
      const range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
      this._run({
        type: "insert",
        begin: range[0],
        end: range[1]
      });
    }
    _doRandomDelete() {
      const idx = getRandomInt(Math.floor(this._deleteCnt / 2), this._deleteCnt - 1);
      this._run({
        type: "delete",
        id: this._state.getExistingNodeId(idx)
      });
    }
    _doRandomChange() {
      const idx = getRandomInt(0, this._deleteCnt - 1);
      const range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
      this._run({
        type: "change",
        id: this._state.getExistingNodeId(idx),
        begin: range[0],
        end: range[1]
      });
    }
    run() {
      while (this._insertCnt > 0 || this._deleteCnt > 0 || this._changeCnt > 0) {
        if (this._insertCnt > 0) {
          this._doRandomInsert();
          this._insertCnt--;
          this._deleteCnt++;
        } else if (this._changeCnt > 0) {
          this._doRandomChange();
          this._changeCnt--;
        } else {
          this._doRandomDelete();
          this._deleteCnt--;
        }
        const searchRange = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
        this._run({
          type: "search",
          begin: searchRange[0],
          end: searchRange[1]
        });
      }
    }
    _run(op) {
      this._ops.push(op);
      this._state.acceptOp(op);
    }
    print() {
      console.log(`testIntervalTree(${JSON.stringify(this._ops)})`);
    }
  }
  suite("generated", () => {
    test("gen01", () => {
      testIntervalTree([
        { type: "insert", begin: 28, end: 35 },
        { type: "insert", begin: 52, end: 54 },
        { type: "insert", begin: 63, end: 69 }
      ]);
    });
    test("gen02", () => {
      testIntervalTree([
        { type: "insert", begin: 80, end: 89 },
        { type: "insert", begin: 92, end: 100 },
        { type: "insert", begin: 99, end: 99 }
      ]);
    });
    test("gen03", () => {
      testIntervalTree([
        { type: "insert", begin: 89, end: 96 },
        { type: "insert", begin: 71, end: 74 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen04", () => {
      testIntervalTree([
        { type: "insert", begin: 44, end: 46 },
        { type: "insert", begin: 85, end: 88 },
        { type: "delete", id: 0 }
      ]);
    });
    test("gen05", () => {
      testIntervalTree([
        { type: "insert", begin: 82, end: 90 },
        { type: "insert", begin: 69, end: 73 },
        { type: "delete", id: 0 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen06", () => {
      testIntervalTree([
        { type: "insert", begin: 41, end: 63 },
        { type: "insert", begin: 98, end: 98 },
        { type: "insert", begin: 47, end: 51 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen07", () => {
      testIntervalTree([
        { type: "insert", begin: 24, end: 26 },
        { type: "insert", begin: 11, end: 28 },
        { type: "insert", begin: 27, end: 30 },
        { type: "insert", begin: 80, end: 85 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen08", () => {
      testIntervalTree([
        { type: "insert", begin: 100, end: 100 },
        { type: "insert", begin: 100, end: 100 }
      ]);
    });
    test("gen09", () => {
      testIntervalTree([
        { type: "insert", begin: 58, end: 65 },
        { type: "insert", begin: 82, end: 96 },
        { type: "insert", begin: 58, end: 65 }
      ]);
    });
    test("gen10", () => {
      testIntervalTree([
        { type: "insert", begin: 32, end: 40 },
        { type: "insert", begin: 25, end: 29 },
        { type: "insert", begin: 24, end: 32 }
      ]);
    });
    test("gen11", () => {
      testIntervalTree([
        { type: "insert", begin: 25, end: 70 },
        { type: "insert", begin: 99, end: 100 },
        { type: "insert", begin: 46, end: 51 },
        { type: "insert", begin: 57, end: 57 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen12", () => {
      testIntervalTree([
        { type: "insert", begin: 20, end: 26 },
        { type: "insert", begin: 10, end: 18 },
        { type: "insert", begin: 99, end: 99 },
        { type: "insert", begin: 37, end: 59 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen13", () => {
      testIntervalTree([
        { type: "insert", begin: 3, end: 91 },
        { type: "insert", begin: 57, end: 57 },
        { type: "insert", begin: 35, end: 44 },
        { type: "insert", begin: 72, end: 81 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen14", () => {
      testIntervalTree([
        { type: "insert", begin: 58, end: 61 },
        { type: "insert", begin: 34, end: 35 },
        { type: "insert", begin: 56, end: 62 },
        { type: "insert", begin: 69, end: 78 },
        { type: "delete", id: 0 }
      ]);
    });
    test("gen15", () => {
      testIntervalTree([
        { type: "insert", begin: 63, end: 69 },
        { type: "insert", begin: 17, end: 24 },
        { type: "insert", begin: 3, end: 13 },
        { type: "insert", begin: 84, end: 94 },
        { type: "insert", begin: 18, end: 23 },
        { type: "insert", begin: 96, end: 98 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen16", () => {
      testIntervalTree([
        { type: "insert", begin: 27, end: 27 },
        { type: "insert", begin: 42, end: 87 },
        { type: "insert", begin: 42, end: 49 },
        { type: "insert", begin: 69, end: 71 },
        { type: "insert", begin: 20, end: 27 },
        { type: "insert", begin: 8, end: 9 },
        { type: "insert", begin: 42, end: 49 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen17", () => {
      testIntervalTree([
        { type: "insert", begin: 21, end: 23 },
        { type: "insert", begin: 83, end: 87 },
        { type: "insert", begin: 56, end: 58 },
        { type: "insert", begin: 1, end: 55 },
        { type: "insert", begin: 56, end: 59 },
        { type: "insert", begin: 58, end: 60 },
        { type: "insert", begin: 56, end: 65 },
        { type: "delete", id: 1 },
        { type: "delete", id: 0 },
        { type: "delete", id: 6 }
      ]);
    });
    test("gen18", () => {
      testIntervalTree([
        { type: "insert", begin: 25, end: 25 },
        { type: "insert", begin: 67, end: 79 },
        { type: "delete", id: 0 },
        { type: "search", begin: 65, end: 75 }
      ]);
    });
    test("force delta overflow", () => {
      testIntervalTree([
        { type: "insert", begin: 686081138593427, end: 733009856502260 },
        { type: "insert", begin: 591031326181669, end: 591031326181672 },
        { type: "insert", begin: 940037682731896, end: 940037682731903 },
        { type: "insert", begin: 598413641151120, end: 598413641151128 },
        { type: "insert", begin: 800564156553344, end: 800564156553351 },
        { type: "insert", begin: 894198957565481, end: 894198957565491 }
      ]);
    });
  });
  for (let i = 0; i < TEST_COUNT; i++) {
    if (i % 100 === 0) {
      console.log(`TEST ${i + 1}/${TEST_COUNT}`);
    }
    const test2 = new AutoTest();
    try {
      test2.run();
    } catch (err) {
      console.log(err);
      test2.print();
      return;
    }
  }
  suite("searching", () => {
    function createCormenTree() {
      const r = new IntervalTree();
      const data = [
        [16, 21],
        [8, 9],
        [25, 30],
        [5, 8],
        [15, 23],
        [17, 19],
        [26, 26],
        [0, 3],
        [6, 10],
        [19, 20]
      ];
      data.forEach((int) => {
        const node = new IntervalNode(null, int[0], int[1]);
        r.insert(node);
      });
      return r;
    }
    const T = createCormenTree();
    function assertIntervalSearch(start, end, expected) {
      const actualNodes = T.intervalSearch(start, end, 0, false, false, 0, false);
      const actual = actualNodes.map((n) => [n.cachedAbsoluteStart, n.cachedAbsoluteEnd]);
      assert.deepStrictEqual(actual, expected);
    }
    test("cormen 1->2", () => {
      assertIntervalSearch(
        1,
        2,
        [
          [0, 3]
        ]
      );
    });
    test("cormen 4->8", () => {
      assertIntervalSearch(
        4,
        8,
        [
          [5, 8],
          [6, 10],
          [8, 9]
        ]
      );
    });
    test("cormen 10->15", () => {
      assertIntervalSearch(
        10,
        15,
        [
          [6, 10],
          [15, 23]
        ]
      );
    });
    test("cormen 21->25", () => {
      assertIntervalSearch(
        21,
        25,
        [
          [15, 23],
          [16, 21],
          [25, 30]
        ]
      );
    });
    test("cormen 24->24", () => {
      assertIntervalSearch(
        24,
        24,
        []
      );
    });
  });
});
suite("IntervalTree 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertNodeAcceptEdit(msg, nodeStart, nodeEnd, nodeStickiness, start, end, textLength, forceMoveMarkers, expectedNodeStart, expectedNodeEnd) {
    const node = new IntervalNode("", nodeStart, nodeEnd);
    setNodeStickiness(node, nodeStickiness);
    nodeAcceptEdit(node, start, end, textLength, forceMoveMarkers);
    assert.deepStrictEqual([node.start, node.end], [expectedNodeStart, expectedNodeEnd], msg);
  }
  test("nodeAcceptEdit", () => {
    {
      assertNodeAcceptEdit("A.000", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.001", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.002", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.003", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.004", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.005", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.006", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.007", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.008", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, false, 0, 1);
      assertNodeAcceptEdit("A.009", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, false, 1, 1);
      assertNodeAcceptEdit("A.010", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, false, 0, 0);
      assertNodeAcceptEdit("A.011", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, false, 1, 1);
      assertNodeAcceptEdit("A.012", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.013", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.014", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.015", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, true, 1, 1);
    }
    {
      assertNodeAcceptEdit("B.000", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.001", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.002", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.003", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.004", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.005", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.006", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.007", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.008", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, false, 0, 6);
      assertNodeAcceptEdit("B.009", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, false, 1, 6);
      assertNodeAcceptEdit("B.010", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, false, 0, 6);
      assertNodeAcceptEdit("B.011", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, false, 1, 6);
      assertNodeAcceptEdit("B.012", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.013", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.014", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.015", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.016", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.017", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.018", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.019", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.020", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.021", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.022", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.023", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.024", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 5, 1, false, 0, 6);
      assertNodeAcceptEdit("B.025", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 5, 1, false, 0, 5);
      assertNodeAcceptEdit("B.026", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 5, 1, false, 0, 5);
      assertNodeAcceptEdit("B.027", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 5, 1, false, 0, 6);
      assertNodeAcceptEdit("B.028", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.029", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.030", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.031", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.032", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 2, false, 5, 11);
      assertNodeAcceptEdit("B.033", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 2, false, 6, 11);
      assertNodeAcceptEdit("B.034", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 2, false, 5, 11);
      assertNodeAcceptEdit("B.035", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 2, false, 6, 11);
      assertNodeAcceptEdit("B.036", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.037", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.038", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.039", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.040", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.041", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.042", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.043", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.044", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.045", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.046", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.047", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.048", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.049", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.050", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.051", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.052", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.053", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.054", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.055", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.056", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.057", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.058", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.059", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.060", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.061", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.062", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.063", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.064", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.065", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.066", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.067", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.068", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.069", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.070", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.071", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.072", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.073", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.074", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.075", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.076", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.077", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.078", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.079", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.080", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 2, false, 5, 11);
      assertNodeAcceptEdit("B.081", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 2, false, 5, 10);
      assertNodeAcceptEdit("B.082", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 2, false, 5, 10);
      assertNodeAcceptEdit("B.083", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 2, false, 5, 11);
      assertNodeAcceptEdit("B.084", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.085", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.086", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.087", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.088", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.089", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.090", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.091", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.092", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.093", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.094", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.095", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.096", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.097", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.098", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.099", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.100", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.101", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.102", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.103", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.104", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.105", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.106", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.107", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.108", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.109", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.110", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.111", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.112", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.113", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.114", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.115", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.116", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.117", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.118", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.119", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.120", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.121", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.122", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.123", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.124", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.125", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.126", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.127", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.128", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.129", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.130", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.131", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.132", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.133", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.134", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.135", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.136", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.137", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.138", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.139", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.140", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.141", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.142", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.143", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.144", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.145", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.146", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.147", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.148", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.149", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.150", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.151", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.152", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.153", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.154", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.155", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.156", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.157", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.158", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.159", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.160", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.161", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.162", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.163", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.164", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.165", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.166", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.167", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.168", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.169", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.170", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.171", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.172", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.173", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.174", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.175", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.176", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.177", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.178", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.179", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.180", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.181", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.182", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.183", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.184", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 7, false, 5, 12);
      assertNodeAcceptEdit("B.185", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 7, false, 5, 10);
      assertNodeAcceptEdit("B.186", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 7, false, 5, 10);
      assertNodeAcceptEdit("B.187", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 7, false, 5, 12);
      assertNodeAcceptEdit("B.188", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.189", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.190", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.191", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 7, true, 12, 12);
    }
  });
});
function printTree(T) {
  if (T.root === SENTINEL) {
    console.log(`~~ empty`);
    return;
  }
  const out = [];
  _printTree(T, T.root, "", 0, out);
  console.log(out.join(""));
}
function _printTree(T, n, indent, delta, out) {
  out.push(`${indent}[${getNodeColor(n) === NodeColor.Red ? "R" : "B"},${n.delta}, ${n.start}->${n.end}, ${n.maxEnd}] : {${delta + n.start}->${delta + n.end}}, maxEnd: ${n.maxEnd + delta}
`);
  if (n.left !== SENTINEL) {
    _printTree(T, n.left, indent + "    ", delta, out);
  } else {
    out.push(`${indent}    NIL
`);
  }
  if (n.right !== SENTINEL) {
    _printTree(T, n.right, indent + "    ", delta + n.delta, out);
  } else {
    out.push(`${indent}    NIL
`);
  }
}
function assertTreeInvariants(T) {
  assert(getNodeColor(SENTINEL) === NodeColor.Black);
  assert(SENTINEL.parent === SENTINEL);
  assert(SENTINEL.left === SENTINEL);
  assert(SENTINEL.right === SENTINEL);
  assert(SENTINEL.start === 0);
  assert(SENTINEL.end === 0);
  assert(SENTINEL.delta === 0);
  assert(T.root.parent === SENTINEL);
  assertValidTree(T);
}
function depth(n) {
  if (n === SENTINEL) {
    return 1;
  }
  assert(depth(n.left) === depth(n.right));
  return (getNodeColor(n) === NodeColor.Black ? 1 : 0) + depth(n.left);
}
function assertValidNode(n, delta) {
  if (n === SENTINEL) {
    return;
  }
  const l = n.left;
  const r = n.right;
  if (getNodeColor(n) === NodeColor.Red) {
    assert(getNodeColor(l) === NodeColor.Black);
    assert(getNodeColor(r) === NodeColor.Black);
  }
  let expectedMaxEnd = n.end;
  if (l !== SENTINEL) {
    assert(intervalCompare(l.start + delta, l.end + delta, n.start + delta, n.end + delta) <= 0);
    expectedMaxEnd = Math.max(expectedMaxEnd, l.maxEnd);
  }
  if (r !== SENTINEL) {
    assert(intervalCompare(n.start + delta, n.end + delta, r.start + delta + n.delta, r.end + delta + n.delta) <= 0);
    expectedMaxEnd = Math.max(expectedMaxEnd, r.maxEnd + n.delta);
  }
  assert(n.maxEnd === expectedMaxEnd);
  assertValidNode(l, delta);
  assertValidNode(r, delta + n.delta);
}
function assertValidTree(T) {
  if (T.root === SENTINEL) {
    return;
  }
  assert(getNodeColor(T.root) === NodeColor.Black);
  assert(depth(T.root.left) === depth(T.root.right));
  assertValidNode(T.root, 0);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGludGVydmFsVHJlZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEludGVydmFsTm9kZSwgSW50ZXJ2YWxUcmVlLCBOb2RlQ29sb3IsIFNFTlRJTkVMLCBnZXROb2RlQ29sb3IsIGludGVydmFsQ29tcGFyZSwgbm9kZUFjY2VwdEVkaXQsIHNldE5vZGVTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2ludGVydmFsVHJlZS5qcyc7XG5cbmNvbnN0IEdFTkVSQVRFX1RFU1RTID0gZmFsc2U7XG5jb25zdCBURVNUX0NPVU5UID0gR0VORVJBVEVfVEVTVFMgPyAxMDAwMCA6IDA7XG5jb25zdCBQUklOVF9UUkVFID0gZmFsc2U7XG5jb25zdCBNSU5fSU5URVJWQUxfU1RBUlQgPSAxO1xuY29uc3QgTUFYX0lOVEVSVkFMX0VORCA9IDEwMDtcbmNvbnN0IE1JTl9JTlNFUlRTID0gMTtcbmNvbnN0IE1BWF9JTlNFUlRTID0gMzA7XG5jb25zdCBNSU5fQ0hBTkdFX0NOVCA9IDEwO1xuY29uc3QgTUFYX0NIQU5HRV9DTlQgPSAyMDtcblxuc3VpdGUoJ0ludGVydmFsVHJlZSAxJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIEludGVydmFsIHtcblx0XHRfaW50ZXJ2YWxCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRcdHB1YmxpYyBzdGFydDogbnVtYmVyO1xuXHRcdHB1YmxpYyBlbmQ6IG51bWJlcjtcblxuXHRcdGNvbnN0cnVjdG9yKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKSB7XG5cdFx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0XHR0aGlzLmVuZCA9IGVuZDtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBPcmFjbGUge1xuXHRcdHB1YmxpYyBpbnRlcnZhbHM6IEludGVydmFsW107XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHRoaXMuaW50ZXJ2YWxzID0gW107XG5cdFx0fVxuXG5cdFx0cHVibGljIGluc2VydChpbnRlcnZhbDogSW50ZXJ2YWwpOiBJbnRlcnZhbCB7XG5cdFx0XHR0aGlzLmludGVydmFscy5wdXNoKGludGVydmFsKTtcblx0XHRcdHRoaXMuaW50ZXJ2YWxzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKGEuc3RhcnQgPT09IGIuc3RhcnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gYS5lbmQgLSBiLmVuZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYS5zdGFydCAtIGIuc3RhcnQ7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBpbnRlcnZhbDtcblx0XHR9XG5cblx0XHRwdWJsaWMgZGVsZXRlKGludGVydmFsOiBJbnRlcnZhbCk6IHZvaWQge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuaW50ZXJ2YWxzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLmludGVydmFsc1tpXSA9PT0gaW50ZXJ2YWwpIHtcblx0XHRcdFx0XHR0aGlzLmludGVydmFscy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHVibGljIHNlYXJjaChpbnRlcnZhbDogSW50ZXJ2YWwpOiBJbnRlcnZhbFtdIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSW50ZXJ2YWxbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuaW50ZXJ2YWxzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGludCA9IHRoaXMuaW50ZXJ2YWxzW2ldO1xuXHRcdFx0XHRpZiAoaW50LnN0YXJ0IDw9IGludGVydmFsLmVuZCAmJiBpbnQuZW5kID49IGludGVydmFsLnN0YXJ0KSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBUZXN0U3RhdGUge1xuXHRcdHByaXZhdGUgX29yYWNsZTogT3JhY2xlID0gbmV3IE9yYWNsZSgpO1xuXHRcdHByaXZhdGUgX3RyZWU6IEludGVydmFsVHJlZSA9IG5ldyBJbnRlcnZhbFRyZWUoKTtcblx0XHRwcml2YXRlIF9sYXN0Tm9kZUlkID0gLTE7XG5cdFx0cHJpdmF0ZSBfdHJlZU5vZGVzOiBBcnJheTxJbnRlcnZhbE5vZGUgfCBudWxsPiA9IFtdO1xuXHRcdHByaXZhdGUgX29yYWNsZU5vZGVzOiBBcnJheTxJbnRlcnZhbCB8IG51bGw+ID0gW107XG5cblx0XHRwdWJsaWMgYWNjZXB0T3Aob3A6IElPcGVyYXRpb24pOiB2b2lkIHtcblxuXHRcdFx0aWYgKG9wLnR5cGUgPT09ICdpbnNlcnQnKSB7XG5cdFx0XHRcdGlmIChQUklOVF9UUkVFKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coYGluc2VydDogeyR7SlNPTi5zdHJpbmdpZnkobmV3IEludGVydmFsKG9wLmJlZ2luLCBvcC5lbmQpKX19YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgbm9kZUlkID0gKCsrdGhpcy5fbGFzdE5vZGVJZCk7XG5cdFx0XHRcdHRoaXMuX3RyZWVOb2Rlc1tub2RlSWRdID0gbmV3IEludGVydmFsTm9kZShudWxsISwgb3AuYmVnaW4sIG9wLmVuZCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuaW5zZXJ0KHRoaXMuX3RyZWVOb2Rlc1tub2RlSWRdISk7XG5cdFx0XHRcdHRoaXMuX29yYWNsZU5vZGVzW25vZGVJZF0gPSB0aGlzLl9vcmFjbGUuaW5zZXJ0KG5ldyBJbnRlcnZhbChvcC5iZWdpbiwgb3AuZW5kKSk7XG5cdFx0XHR9IGVsc2UgaWYgKG9wLnR5cGUgPT09ICdkZWxldGUnKSB7XG5cdFx0XHRcdGlmIChQUklOVF9UUkVFKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coYGRlbGV0ZTogeyR7SlNPTi5zdHJpbmdpZnkodGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdKX19YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdHJlZS5kZWxldGUodGhpcy5fdHJlZU5vZGVzW29wLmlkXSEpO1xuXHRcdFx0XHR0aGlzLl9vcmFjbGUuZGVsZXRlKHRoaXMuX29yYWNsZU5vZGVzW29wLmlkXSEpO1xuXG5cdFx0XHRcdHRoaXMuX3RyZWVOb2Rlc1tvcC5pZF0gPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9vcmFjbGVOb2Rlc1tvcC5pZF0gPSBudWxsO1xuXHRcdFx0fSBlbHNlIGlmIChvcC50eXBlID09PSAnY2hhbmdlJykge1xuXG5cdFx0XHRcdHRoaXMuX3RyZWUuZGVsZXRlKHRoaXMuX3RyZWVOb2Rlc1tvcC5pZF0hKTtcblx0XHRcdFx0dGhpcy5fdHJlZU5vZGVzW29wLmlkXSEucmVzZXQoMCwgb3AuYmVnaW4sIG9wLmVuZCwgbnVsbCEpO1xuXHRcdFx0XHR0aGlzLl90cmVlLmluc2VydCh0aGlzLl90cmVlTm9kZXNbb3AuaWRdISk7XG5cblx0XHRcdFx0dGhpcy5fb3JhY2xlLmRlbGV0ZSh0aGlzLl9vcmFjbGVOb2Rlc1tvcC5pZF0hKTtcblx0XHRcdFx0dGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdIS5zdGFydCA9IG9wLmJlZ2luO1xuXHRcdFx0XHR0aGlzLl9vcmFjbGVOb2Rlc1tvcC5pZF0hLmVuZCA9IG9wLmVuZDtcblx0XHRcdFx0dGhpcy5fb3JhY2xlLmluc2VydCh0aGlzLl9vcmFjbGVOb2Rlc1tvcC5pZF0hKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsTm9kZXMgPSB0aGlzLl90cmVlLmludGVydmFsU2VhcmNoKG9wLmJlZ2luLCBvcC5lbmQsIDAsIGZhbHNlLCBmYWxzZSwgMCwgZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSBhY3R1YWxOb2Rlcy5tYXAobiA9PiBuZXcgSW50ZXJ2YWwobi5jYWNoZWRBYnNvbHV0ZVN0YXJ0LCBuLmNhY2hlZEFic29sdXRlRW5kKSk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gdGhpcy5fb3JhY2xlLnNlYXJjaChuZXcgSW50ZXJ2YWwob3AuYmVnaW4sIG9wLmVuZCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChQUklOVF9UUkVFKSB7XG5cdFx0XHRcdHByaW50VHJlZSh0aGlzLl90cmVlKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0VHJlZUludmFyaWFudHModGhpcy5fdHJlZSk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IHRoaXMuX3RyZWUuZ2V0QWxsSW5PcmRlcigpLm1hcChuID0+IG5ldyBJbnRlcnZhbChuLmNhY2hlZEFic29sdXRlU3RhcnQsIG4uY2FjaGVkQWJzb2x1dGVFbmQpKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gdGhpcy5fb3JhY2xlLmludGVydmFscztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGdldEV4aXN0aW5nTm9kZUlkKGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0bGV0IGN1cnJJbmRleCA9IC0xO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl90cmVlTm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuX3RyZWVOb2Rlc1tpXSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1cnJJbmRleCsrO1xuXHRcdFx0XHRpZiAoY3VyckluZGV4ID09PSBpbmRleCkge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3VuZXhwZWN0ZWQnKTtcblx0XHR9XG5cdH1cblxuXHRpbnRlcmZhY2UgSUluc2VydE9wZXJhdGlvbiB7XG5cdFx0dHlwZTogJ2luc2VydCc7XG5cdFx0YmVnaW46IG51bWJlcjtcblx0XHRlbmQ6IG51bWJlcjtcblx0fVxuXG5cdGludGVyZmFjZSBJRGVsZXRlT3BlcmF0aW9uIHtcblx0XHR0eXBlOiAnZGVsZXRlJztcblx0XHRpZDogbnVtYmVyO1xuXHR9XG5cblx0aW50ZXJmYWNlIElDaGFuZ2VPcGVyYXRpb24ge1xuXHRcdHR5cGU6ICdjaGFuZ2UnO1xuXHRcdGlkOiBudW1iZXI7XG5cdFx0YmVnaW46IG51bWJlcjtcblx0XHRlbmQ6IG51bWJlcjtcblx0fVxuXG5cdGludGVyZmFjZSBJU2VhcmNoT3BlcmF0aW9uIHtcblx0XHR0eXBlOiAnc2VhcmNoJztcblx0XHRiZWdpbjogbnVtYmVyO1xuXHRcdGVuZDogbnVtYmVyO1xuXHR9XG5cblx0dHlwZSBJT3BlcmF0aW9uID0gSUluc2VydE9wZXJhdGlvbiB8IElEZWxldGVPcGVyYXRpb24gfCBJQ2hhbmdlT3BlcmF0aW9uIHwgSVNlYXJjaE9wZXJhdGlvbjtcblxuXHRmdW5jdGlvbiB0ZXN0SW50ZXJ2YWxUcmVlKG9wczogSU9wZXJhdGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgVGVzdFN0YXRlKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHN0YXRlLmFjY2VwdE9wKG9wc1tpXSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0UmFuZG9tSW50KG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRSYW5kb21SYW5nZShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXJdIHtcblx0XHRjb25zdCBiZWdpbiA9IGdldFJhbmRvbUludChtaW4sIG1heCk7XG5cdFx0bGV0IGxlbmd0aDogbnVtYmVyO1xuXHRcdGlmIChnZXRSYW5kb21JbnQoMSwgMTApIDw9IDIpIHtcblx0XHRcdC8vIGxhcmdlIHJhbmdlXG5cdFx0XHRsZW5ndGggPSBnZXRSYW5kb21JbnQoMCwgbWF4IC0gYmVnaW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBzbWFsbCByYW5nZVxuXHRcdFx0bGVuZ3RoID0gZ2V0UmFuZG9tSW50KDAsIE1hdGgubWluKG1heCAtIGJlZ2luLCAxMCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gW2JlZ2luLCBiZWdpbiArIGxlbmd0aF07XG5cdH1cblxuXHRjbGFzcyBBdXRvVGVzdCB7XG5cdFx0cHJpdmF0ZSBfb3BzOiBJT3BlcmF0aW9uW10gPSBbXTtcblx0XHRwcml2YXRlIF9zdGF0ZTogVGVzdFN0YXRlID0gbmV3IFRlc3RTdGF0ZSgpO1xuXHRcdHByaXZhdGUgX2luc2VydENudDogbnVtYmVyO1xuXHRcdHByaXZhdGUgX2RlbGV0ZUNudDogbnVtYmVyO1xuXHRcdHByaXZhdGUgX2NoYW5nZUNudDogbnVtYmVyO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHR0aGlzLl9pbnNlcnRDbnQgPSBnZXRSYW5kb21JbnQoTUlOX0lOU0VSVFMsIE1BWF9JTlNFUlRTKTtcblx0XHRcdHRoaXMuX2NoYW5nZUNudCA9IGdldFJhbmRvbUludChNSU5fQ0hBTkdFX0NOVCwgTUFYX0NIQU5HRV9DTlQpO1xuXHRcdFx0dGhpcy5fZGVsZXRlQ250ID0gMDtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9kb1JhbmRvbUluc2VydCgpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZ2V0UmFuZG9tUmFuZ2UoTUlOX0lOVEVSVkFMX1NUQVJULCBNQVhfSU5URVJWQUxfRU5EKTtcblx0XHRcdHRoaXMuX3J1bih7XG5cdFx0XHRcdHR5cGU6ICdpbnNlcnQnLFxuXHRcdFx0XHRiZWdpbjogcmFuZ2VbMF0sXG5cdFx0XHRcdGVuZDogcmFuZ2VbMV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2RvUmFuZG9tRGVsZXRlKCk6IHZvaWQge1xuXHRcdFx0Y29uc3QgaWR4ID0gZ2V0UmFuZG9tSW50KE1hdGguZmxvb3IodGhpcy5fZGVsZXRlQ250IC8gMiksIHRoaXMuX2RlbGV0ZUNudCAtIDEpO1xuXHRcdFx0dGhpcy5fcnVuKHtcblx0XHRcdFx0dHlwZTogJ2RlbGV0ZScsXG5cdFx0XHRcdGlkOiB0aGlzLl9zdGF0ZS5nZXRFeGlzdGluZ05vZGVJZChpZHgpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9kb1JhbmRvbUNoYW5nZSgpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGlkeCA9IGdldFJhbmRvbUludCgwLCB0aGlzLl9kZWxldGVDbnQgLSAxKTtcblx0XHRcdGNvbnN0IHJhbmdlID0gZ2V0UmFuZG9tUmFuZ2UoTUlOX0lOVEVSVkFMX1NUQVJULCBNQVhfSU5URVJWQUxfRU5EKTtcblx0XHRcdHRoaXMuX3J1bih7XG5cdFx0XHRcdHR5cGU6ICdjaGFuZ2UnLFxuXHRcdFx0XHRpZDogdGhpcy5fc3RhdGUuZ2V0RXhpc3RpbmdOb2RlSWQoaWR4KSxcblx0XHRcdFx0YmVnaW46IHJhbmdlWzBdLFxuXHRcdFx0XHRlbmQ6IHJhbmdlWzFdXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuKCkge1xuXHRcdFx0d2hpbGUgKHRoaXMuX2luc2VydENudCA+IDAgfHwgdGhpcy5fZGVsZXRlQ250ID4gMCB8fCB0aGlzLl9jaGFuZ2VDbnQgPiAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pbnNlcnRDbnQgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9SYW5kb21JbnNlcnQoKTtcblx0XHRcdFx0XHR0aGlzLl9pbnNlcnRDbnQtLTtcblx0XHRcdFx0XHR0aGlzLl9kZWxldGVDbnQrKztcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jaGFuZ2VDbnQgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9SYW5kb21DaGFuZ2UoKTtcblx0XHRcdFx0XHR0aGlzLl9jaGFuZ2VDbnQtLTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kb1JhbmRvbURlbGV0ZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2RlbGV0ZUNudC0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTGV0J3MgYWxzbyBzZWFyY2ggZm9yIHNvbWV0aGluZy4uLlxuXHRcdFx0XHRjb25zdCBzZWFyY2hSYW5nZSA9IGdldFJhbmRvbVJhbmdlKE1JTl9JTlRFUlZBTF9TVEFSVCwgTUFYX0lOVEVSVkFMX0VORCk7XG5cdFx0XHRcdHRoaXMuX3J1bih7XG5cdFx0XHRcdFx0dHlwZTogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0YmVnaW46IHNlYXJjaFJhbmdlWzBdLFxuXHRcdFx0XHRcdGVuZDogc2VhcmNoUmFuZ2VbMV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfcnVuKG9wOiBJT3BlcmF0aW9uKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9vcHMucHVzaChvcCk7XG5cdFx0XHR0aGlzLl9zdGF0ZS5hY2NlcHRPcChvcCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHByaW50KCk6IHZvaWQge1xuXHRcdFx0Y29uc29sZS5sb2coYHRlc3RJbnRlcnZhbFRyZWUoJHtKU09OLnN0cmluZ2lmeSh0aGlzLl9vcHMpfSlgKTtcblx0XHR9XG5cblx0fVxuXG5cdHN1aXRlKCdnZW5lcmF0ZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZ2VuMDEnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDI4LCBlbmQ6IDM1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1MiwgZW5kOiA1NCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNjMsIGVuZDogNjkgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wMicsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODAsIGVuZDogODkgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDkyLCBlbmQ6IDEwMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogOTksIGVuZDogOTkgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wMycsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODksIGVuZDogOTYgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDcxLCBlbmQ6IDc0IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAxIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMDQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDQ0LCBlbmQ6IDQ2IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4NSwgZW5kOiA4OCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMCB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjA1JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4MiwgZW5kOiA5MCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNjksIGVuZDogNzMgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDAgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDEgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wNicsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNDEsIGVuZDogNjMgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDk4LCBlbmQ6IDk4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0NywgZW5kOiA1MSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMiB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjA3JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyNCwgZW5kOiAyNiB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMTEsIGVuZDogMjggfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDI3LCBlbmQ6IDMwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4MCwgZW5kOiA4NSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjA4JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAxMDAsIGVuZDogMTAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAxMDAsIGVuZDogMTAwIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMDknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU4LCBlbmQ6IDY1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4MiwgZW5kOiA5NiB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTgsIGVuZDogNjUgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xMCcsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMzIsIGVuZDogNDAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDI1LCBlbmQ6IDI5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyNCwgZW5kOiAzMiB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjExJywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyNSwgZW5kOiA3MCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogOTksIGVuZDogMTAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0NiwgZW5kOiA1MSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTcsIGVuZDogNTcgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDIgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xMicsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjAsIGVuZDogMjYgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDEwLCBlbmQ6IDE4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA5OSwgZW5kOiA5OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMzcsIGVuZDogNTkgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDIgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xMycsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMywgZW5kOiA5MSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTcsIGVuZDogNTcgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDM1LCBlbmQ6IDQ0IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA3MiwgZW5kOiA4MSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMiB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjE0JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1OCwgZW5kOiA2MSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMzQsIGVuZDogMzUgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU2LCBlbmQ6IDYyIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA2OSwgZW5kOiA3OCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMCB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjE1JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA2MywgZW5kOiA2OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMTcsIGVuZDogMjQgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDMsIGVuZDogMTMgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDg0LCBlbmQ6IDk0IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAxOCwgZW5kOiAyMyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogOTYsIGVuZDogOTggfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDEgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xNicsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjcsIGVuZDogMjcgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDQyLCBlbmQ6IDg3IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0MiwgZW5kOiA0OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNjksIGVuZDogNzEgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDIwLCBlbmQ6IDI3IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4LCBlbmQ6IDkgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDQyLCBlbmQ6IDQ5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAxIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTcnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDIxLCBlbmQ6IDIzIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4MywgZW5kOiA4NyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTYsIGVuZDogNTggfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDEsIGVuZDogNTUgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU2LCBlbmQ6IDU5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1OCwgZW5kOiA2MCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTYsIGVuZDogNjUgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDEgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDAgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDYgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xOCcsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjUsIGVuZDogMjUgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDY3LCBlbmQ6IDc5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NlYXJjaCcsIGJlZ2luOiA2NSwgZW5kOiA3NSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmNlIGRlbHRhIG92ZXJmbG93JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2VhcmNoIHRoZSBJbnRlcnZhbE5vZGUgY3RvciBmb3IgRk9SQ0VfT1ZFUkZMT1dJTkdfVEVTVFxuXHRcdFx0Ly8gdG8gZm9yY2UgdGhhdCB0aGlzIHRlc3QgbGVhZHMgdG8gYSBkZWx0YSBub3JtYWxpemF0aW9uXG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDY4NjA4MTEzODU5MzQyNywgZW5kOiA3MzMwMDk4NTY1MDIyNjAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU5MTAzMTMyNjE4MTY2OSwgZW5kOiA1OTEwMzEzMjYxODE2NzIgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDk0MDAzNzY4MjczMTg5NiwgZW5kOiA5NDAwMzc2ODI3MzE5MDMgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU5ODQxMzY0MTE1MTEyMCwgZW5kOiA1OTg0MTM2NDExNTExMjggfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDgwMDU2NDE1NjU1MzM0NCwgZW5kOiA4MDA1NjQxNTY1NTMzNTEgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDg5NDE5ODk1NzU2NTQ4MSwgZW5kOiA4OTQxOTg5NTc1NjU0OTEgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFRFU1RfQ09VTlQgPSAwO1xuXHQvLyBQUklOVF9UUkVFID0gdHJ1ZTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IFRFU1RfQ09VTlQ7IGkrKykge1xuXHRcdGlmIChpICUgMTAwID09PSAwKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgVEVTVCAke2kgKyAxfS8ke1RFU1RfQ09VTlR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRlc3QgPSBuZXcgQXV0b1Rlc3QoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0ZXN0LnJ1bigpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5sb2coZXJyKTtcblx0XHRcdHRlc3QucHJpbnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRzdWl0ZSgnc2VhcmNoaW5nJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ29ybWVuVHJlZSgpOiBJbnRlcnZhbFRyZWUge1xuXHRcdFx0Y29uc3QgciA9IG5ldyBJbnRlcnZhbFRyZWUoKTtcblx0XHRcdGNvbnN0IGRhdGE6IFtudW1iZXIsIG51bWJlcl1bXSA9IFtcblx0XHRcdFx0WzE2LCAyMV0sXG5cdFx0XHRcdFs4LCA5XSxcblx0XHRcdFx0WzI1LCAzMF0sXG5cdFx0XHRcdFs1LCA4XSxcblx0XHRcdFx0WzE1LCAyM10sXG5cdFx0XHRcdFsxNywgMTldLFxuXHRcdFx0XHRbMjYsIDI2XSxcblx0XHRcdFx0WzAsIDNdLFxuXHRcdFx0XHRbNiwgMTBdLFxuXHRcdFx0XHRbMTksIDIwXVxuXHRcdFx0XTtcblx0XHRcdGRhdGEuZm9yRWFjaCgoaW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSBuZXcgSW50ZXJ2YWxOb2RlKG51bGwhLCBpbnRbMF0sIGludFsxXSk7XG5cdFx0XHRcdHIuaW5zZXJ0KG5vZGUpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cblx0XHRjb25zdCBUID0gY3JlYXRlQ29ybWVuVHJlZSgpO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0SW50ZXJ2YWxTZWFyY2goc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGV4cGVjdGVkOiBbbnVtYmVyLCBudW1iZXJdW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbE5vZGVzID0gVC5pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCAwLCBmYWxzZSwgZmFsc2UsIDAsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGFjdHVhbE5vZGVzLm1hcCgobikgPT4gPFtudW1iZXIsIG51bWJlcl0+W24uY2FjaGVkQWJzb2x1dGVTdGFydCwgbi5jYWNoZWRBYnNvbHV0ZUVuZF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjb3JtZW4gMS0+MicsICgpID0+IHtcblx0XHRcdGFzc2VydEludGVydmFsU2VhcmNoKFxuXHRcdFx0XHQxLCAyLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WzAsIDNdLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29ybWVuIDQtPjgnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRJbnRlcnZhbFNlYXJjaChcblx0XHRcdFx0NCwgOCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFs1LCA4XSxcblx0XHRcdFx0XHRbNiwgMTBdLFxuXHRcdFx0XHRcdFs4LCA5XSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nvcm1lbiAxMC0+MTUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRJbnRlcnZhbFNlYXJjaChcblx0XHRcdFx0MTAsIDE1LFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WzYsIDEwXSxcblx0XHRcdFx0XHRbMTUsIDIzXSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nvcm1lbiAyMS0+MjUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRJbnRlcnZhbFNlYXJjaChcblx0XHRcdFx0MjEsIDI1LFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WzE1LCAyM10sXG5cdFx0XHRcdFx0WzE2LCAyMV0sXG5cdFx0XHRcdFx0WzI1LCAzMF0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3JtZW4gMjQtPjI0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0SW50ZXJ2YWxTZWFyY2goXG5cdFx0XHRcdDI0LCAyNCxcblx0XHRcdFx0W1xuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnSW50ZXJ2YWxUcmVlIDInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Tm9kZUFjY2VwdEVkaXQobXNnOiBzdHJpbmcsIG5vZGVTdGFydDogbnVtYmVyLCBub2RlRW5kOiBudW1iZXIsIG5vZGVTdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgdGV4dExlbmd0aDogbnVtYmVyLCBmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuLCBleHBlY3RlZE5vZGVTdGFydDogbnVtYmVyLCBleHBlY3RlZE5vZGVFbmQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGUgPSBuZXcgSW50ZXJ2YWxOb2RlKCcnLCBub2RlU3RhcnQsIG5vZGVFbmQpO1xuXHRcdHNldE5vZGVTdGlja2luZXNzKG5vZGUsIG5vZGVTdGlja2luZXNzKTtcblx0XHRub2RlQWNjZXB0RWRpdChub2RlLCBzdGFydCwgZW5kLCB0ZXh0TGVuZ3RoLCBmb3JjZU1vdmVNYXJrZXJzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtub2RlLnN0YXJ0LCBub2RlLmVuZF0sIFtleHBlY3RlZE5vZGVTdGFydCwgZXhwZWN0ZWROb2RlRW5kXSwgbXNnKTtcblx0fVxuXG5cdHRlc3QoJ25vZGVBY2NlcHRFZGl0JywgKCkgPT4ge1xuXHRcdC8vIEEuIGNvbGxhcHNlZCBkZWNvcmF0aW9uXG5cdFx0e1xuXHRcdFx0Ly8gbm8tb3Bcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwMCcsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgZmFsc2UsIDAsIDApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDAxJywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDAsIGZhbHNlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwMicsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMCwgMCwgMCwgZmFsc2UsIDAsIDApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDAzJywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDAsIGZhbHNlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwNCcsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgdHJ1ZSwgMCwgMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDUnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgdHJ1ZSwgMCwgMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDYnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDAsIHRydWUsIDAsIDApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDA3JywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDAsIHRydWUsIDAsIDApO1xuXHRcdFx0Ly8gaW5zZXJ0aW9uXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDgnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIGZhbHNlLCAwLCAxKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwOScsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAxLCBmYWxzZSwgMSwgMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMTAnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDEsIGZhbHNlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAxMScsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAxLCBmYWxzZSwgMSwgMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMTInLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIHRydWUsIDEsIDEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDEzJywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIHRydWUsIDEsIDEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDE0JywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAwLCAwLCAxLCB0cnVlLCAxLCAxKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAxNScsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAxLCB0cnVlLCAxLCAxKTtcblx0XHR9XG5cblx0XHQvLyBCLiBub24gY29sbGFwc2VkIGRlY29yYXRpb25cblx0XHR7XG5cdFx0XHQvLyBuby1vcFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDAwJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAwLCBmYWxzZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDEnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgZmFsc2UsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDAyJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAwLCAwLCAwLCBmYWxzZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDMnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMCwgMCwgMCwgZmFsc2UsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDA0JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAwLCB0cnVlLCAwLCA1KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwNScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAwLCB0cnVlLCAwLCA1KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwNicsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMCwgMCwgMCwgdHJ1ZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDcnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMCwgMCwgMCwgdHJ1ZSwgMCwgNSk7XG5cdFx0XHQvLyBpbnNlcnRpb24gYXQgc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwOCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDA5JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIGZhbHNlLCAxLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxMCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMCwgMCwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDExJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDEsIGZhbHNlLCAxLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxMicsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMSwgdHJ1ZSwgMSwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTMnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMSwgdHJ1ZSwgMSwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTQnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDEsIHRydWUsIDEsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE1JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDEsIHRydWUsIDEsIDYpO1xuXHRcdFx0Ly8gaW5zZXJ0aW9uIGluIG1pZGRsZVxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE2JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAyLCAyLCAxLCBmYWxzZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTcnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMiwgMiwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE4JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAyLCAyLCAxLCBmYWxzZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTknLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMiwgMiwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDIwJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAyLCAyLCAxLCB0cnVlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyMScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAyLCAyLCAxLCB0cnVlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyMicsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMiwgMiwgMSwgdHJ1ZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjMnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMiwgMiwgMSwgdHJ1ZSwgMCwgNik7XG5cdFx0XHQvLyBpbnNlcnRpb24gYXQgZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjQnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDUsIDEsIGZhbHNlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyNScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA1LCAxLCBmYWxzZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjYnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDUsIDEsIGZhbHNlLCAwLCA1KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyNycsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA1LCAxLCBmYWxzZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjgnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDUsIDEsIHRydWUsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDI5JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDUsIDEsIHRydWUsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDMwJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA1LCAxLCB0cnVlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzMScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA1LCAxLCB0cnVlLCAwLCA2KTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IHVudGlsIHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMzInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA1LCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDMzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA1LCAyLCBmYWxzZSwgNiwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDM0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNSwgMiwgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzNScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNSwgMiwgZmFsc2UsIDYsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzNicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDUsIDIsIHRydWUsIDYsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzNycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMiwgdHJ1ZSwgNiwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDM4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNSwgMiwgdHJ1ZSwgNiwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDM5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA1LCAyLCB0cnVlLCA2LCAxMSk7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IHVudGlsIHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAzLCA1LCAxLCBmYWxzZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDMsIDUsIDEsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA0MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDMsIDUsIDEsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA0MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMywgNSwgMSwgZmFsc2UsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMywgNSwgMSwgdHJ1ZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDMsIDUsIDEsIHRydWUsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMywgNSwgMSwgdHJ1ZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDMsIDUsIDEsIHRydWUsIDQsIDkpO1xuXG5cdFx0XHQvLyByZXBsYWNlIHdpdGggbGFyZ2VyIHRleHQgc2VsZWN0IHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAzLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAzLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDUwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNiwgMywgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1MScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNiwgMywgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDMsIHRydWUsIDcsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMywgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNiwgMywgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA2LCAzLCB0cnVlLCA3LCAxMSk7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IHNlbGVjdCBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNTgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA0LCA2LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNTknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDQsIDYsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDEsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDYxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAxLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDYsIDEsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDYzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA2LCAxLCB0cnVlLCA1LCA5KTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IGZyb20gc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDIsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNjUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDIsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNjYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA2LCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDY3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA2LCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDY4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNiwgMiwgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDY5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAyLCB0cnVlLCA3LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA2LCAyLCB0cnVlLCA3LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDYsIDIsIHRydWUsIDcsIDExKTtcblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBzbWFsbGVyIHRleHQgZnJvbSBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDcyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNywgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDczJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA3LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA3LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDcsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDcsIDEsIHRydWUsIDYsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDc3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA3LCAxLCB0cnVlLCA2LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDcsIDEsIHRydWUsIDYsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDc5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA3LCAxLCB0cnVlLCA2LCA5KTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IHRvIGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDgwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDIsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAyLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDgyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTAsIDIsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDEwLCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDg0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDIsIHRydWUsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDIsIHRydWUsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDEwLCAyLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDEwLCAyLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IHRvIGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDg4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOCwgMTAsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOCwgMTAsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA5MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDgsIDEwLCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDgsIDEwLCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA4LCAxMCwgMSwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDgsIDEwLCAxLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA5NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDgsIDEwLCAxLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA5NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOCwgMTAsIDEsIHRydWUsIDUsIDkpO1xuXG5cdFx0XHQvLyByZXBsYWNlIHdpdGggbGFyZ2VyIHRleHQgc2VsZWN0IGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDk2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDMsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDk4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTEsIDMsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTAwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDMsIHRydWUsIDUsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwMScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDMsIHRydWUsIDUsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwMicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDExLCAzLCB0cnVlLCA1LCAxMik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDExLCAzLCB0cnVlLCA1LCAxMik7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IHNlbGVjdCBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwNCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAxLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTA1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwNicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDExLCAxLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTA3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMSwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwOCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAxLCB0cnVlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAxLCB0cnVlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA5LCAxMSwgMSwgdHJ1ZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTExJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMSwgMSwgdHJ1ZSwgNSwgMTApO1xuXG5cdFx0XHQvLyByZXBsYWNlIHdpdGggbGFyZ2VyIHRleHQgZnJvbSBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExMicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMSwgMywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExMycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTE0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMTAsIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTE1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAxMCwgMTEsIDMsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTEsIDMsIHRydWUsIDUsIDEzKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExNycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAzLCB0cnVlLCA1LCAxMyk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAxMCwgMTEsIDMsIHRydWUsIDUsIDEzKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExOScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMTAsIDExLCAzLCB0cnVlLCA1LCAxMyk7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IGZyb20gZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTIsIDEsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMiwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyMicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDEwLCAxMiwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyMycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMTAsIDEyLCAxLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTI0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDEyLCAxLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMiwgMSwgdHJ1ZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTI2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMTAsIDEyLCAxLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDEwLCAxMiwgMSwgdHJ1ZSwgNSwgMTEpO1xuXG5cdFx0XHQvLyBkZWxldGUgdW50aWwgc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyOCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDUsIDAsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyOScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMCwgZmFsc2UsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTMwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNSwgMCwgZmFsc2UsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTMxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA1LCAwLCBmYWxzZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA1LCAwLCB0cnVlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzMycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMCwgdHJ1ZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA0LCA1LCAwLCB0cnVlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzNScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNSwgMCwgdHJ1ZSwgNCwgOSk7XG5cblx0XHRcdC8vIGRlbGV0ZSBzZWxlY3Qgc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzNicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDAsIGZhbHNlLCA0LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzNycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMCwgZmFsc2UsIDQsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTM4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNiwgMCwgZmFsc2UsIDQsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTM5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA2LCAwLCBmYWxzZSwgNCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAwLCB0cnVlLCA0LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE0MScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMCwgdHJ1ZSwgNCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA0LCA2LCAwLCB0cnVlLCA0LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE0MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNiwgMCwgdHJ1ZSwgNCwgOCk7XG5cblx0XHRcdC8vIGRlbGV0ZSBmcm9tIHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE0NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDYsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE0NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgNiwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQ4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNiwgMCwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTUwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNSwgNiwgMCwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNTEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDYsIDAsIHRydWUsIDUsIDkpO1xuXG5cdFx0XHQvLyBkZWxldGUgdG8gZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNTInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMCwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTUzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMCwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTU0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTAsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTAsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTU4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTAsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTU5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMCwgMCwgdHJ1ZSwgNSwgOSk7XG5cblx0XHRcdC8vIGRlbGV0ZSBzZWxlY3QgZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNjAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTYxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTYyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTEsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTEsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTY2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTEsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTY3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMSwgMCwgdHJ1ZSwgNSwgOSk7XG5cblx0XHRcdC8vIGRlbGV0ZSBmcm9tIGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTY4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAwLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTY5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTEsIDAsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAxMCwgMTEsIDAsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDEwLCAxMSwgMCwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMSwgMCwgdHJ1ZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTczJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTEsIDAsIHRydWUsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDEwLCAxMSwgMCwgdHJ1ZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTc1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAxMCwgMTEsIDAsIHRydWUsIDUsIDEwKTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IGVudGlyZVxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTc2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgMTAsIDMsIGZhbHNlLCA1LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgMTAsIDMsIGZhbHNlLCA1LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDEwLCAzLCBmYWxzZSwgNSwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDEwLCAzLCBmYWxzZSwgNSwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgMywgdHJ1ZSwgOCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDEwLCAzLCB0cnVlLCA4LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDEwLCAzLCB0cnVlLCA4LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgMTAsIDMsIHRydWUsIDgsIDgpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCBlbnRpcmVcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDEwLCA3LCBmYWxzZSwgNSwgMTIpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTg1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgNywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDEwLCA3LCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTg3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCAxMCwgNywgZmFsc2UsIDUsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDEwLCA3LCB0cnVlLCAxMiwgMTIpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTg5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgNywgdHJ1ZSwgMTIsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE5MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDEwLCA3LCB0cnVlLCAxMiwgMTIpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTkxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCAxMCwgNywgdHJ1ZSwgMTIsIDEyKTtcblxuXHRcdH1cblx0fSk7XG59KTtcblxuZnVuY3Rpb24gcHJpbnRUcmVlKFQ6IEludGVydmFsVHJlZSk6IHZvaWQge1xuXHRpZiAoVC5yb290ID09PSBTRU5USU5FTCkge1xuXHRcdGNvbnNvbGUubG9nKGB+fiBlbXB0eWApO1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdF9wcmludFRyZWUoVCwgVC5yb290LCAnJywgMCwgb3V0KTtcblx0Y29uc29sZS5sb2cob3V0LmpvaW4oJycpKTtcbn1cblxuZnVuY3Rpb24gX3ByaW50VHJlZShUOiBJbnRlcnZhbFRyZWUsIG46IEludGVydmFsTm9kZSwgaW5kZW50OiBzdHJpbmcsIGRlbHRhOiBudW1iZXIsIG91dDogc3RyaW5nW10pOiB2b2lkIHtcblx0b3V0LnB1c2goYCR7aW5kZW50fVske2dldE5vZGVDb2xvcihuKSA9PT0gTm9kZUNvbG9yLlJlZCA/ICdSJyA6ICdCJ30sJHtuLmRlbHRhfSwgJHtuLnN0YXJ0fS0+JHtuLmVuZH0sICR7bi5tYXhFbmR9XSA6IHske2RlbHRhICsgbi5zdGFydH0tPiR7ZGVsdGEgKyBuLmVuZH19LCBtYXhFbmQ6ICR7bi5tYXhFbmQgKyBkZWx0YX1cXG5gKTtcblx0aWYgKG4ubGVmdCAhPT0gU0VOVElORUwpIHtcblx0XHRfcHJpbnRUcmVlKFQsIG4ubGVmdCwgaW5kZW50ICsgJyAgICAnLCBkZWx0YSwgb3V0KTtcblx0fSBlbHNlIHtcblx0XHRvdXQucHVzaChgJHtpbmRlbnR9ICAgIE5JTFxcbmApO1xuXHR9XG5cdGlmIChuLnJpZ2h0ICE9PSBTRU5USU5FTCkge1xuXHRcdF9wcmludFRyZWUoVCwgbi5yaWdodCwgaW5kZW50ICsgJyAgICAnLCBkZWx0YSArIG4uZGVsdGEsIG91dCk7XG5cdH0gZWxzZSB7XG5cdFx0b3V0LnB1c2goYCR7aW5kZW50fSAgICBOSUxcXG5gKTtcblx0fVxufVxuXG4vLyNyZWdpb24gQXNzZXJ0aW9uXG5cbmZ1bmN0aW9uIGFzc2VydFRyZWVJbnZhcmlhbnRzKFQ6IEludGVydmFsVHJlZSk6IHZvaWQge1xuXHRhc3NlcnQoZ2V0Tm9kZUNvbG9yKFNFTlRJTkVMKSA9PT0gTm9kZUNvbG9yLkJsYWNrKTtcblx0YXNzZXJ0KFNFTlRJTkVMLnBhcmVudCA9PT0gU0VOVElORUwpO1xuXHRhc3NlcnQoU0VOVElORUwubGVmdCA9PT0gU0VOVElORUwpO1xuXHRhc3NlcnQoU0VOVElORUwucmlnaHQgPT09IFNFTlRJTkVMKTtcblx0YXNzZXJ0KFNFTlRJTkVMLnN0YXJ0ID09PSAwKTtcblx0YXNzZXJ0KFNFTlRJTkVMLmVuZCA9PT0gMCk7XG5cdGFzc2VydChTRU5USU5FTC5kZWx0YSA9PT0gMCk7XG5cdGFzc2VydChULnJvb3QucGFyZW50ID09PSBTRU5USU5FTCk7XG5cdGFzc2VydFZhbGlkVHJlZShUKTtcbn1cblxuZnVuY3Rpb24gZGVwdGgobjogSW50ZXJ2YWxOb2RlKTogbnVtYmVyIHtcblx0aWYgKG4gPT09IFNFTlRJTkVMKSB7XG5cdFx0Ly8gVGhlIGxlYWZzIGFyZSBibGFja1xuXHRcdHJldHVybiAxO1xuXHR9XG5cdGFzc2VydChkZXB0aChuLmxlZnQpID09PSBkZXB0aChuLnJpZ2h0KSk7XG5cdHJldHVybiAoZ2V0Tm9kZUNvbG9yKG4pID09PSBOb2RlQ29sb3IuQmxhY2sgPyAxIDogMCkgKyBkZXB0aChuLmxlZnQpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRWYWxpZE5vZGUobjogSW50ZXJ2YWxOb2RlLCBkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdGlmIChuID09PSBTRU5USU5FTCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGwgPSBuLmxlZnQ7XG5cdGNvbnN0IHIgPSBuLnJpZ2h0O1xuXG5cdGlmIChnZXROb2RlQ29sb3IobikgPT09IE5vZGVDb2xvci5SZWQpIHtcblx0XHRhc3NlcnQoZ2V0Tm9kZUNvbG9yKGwpID09PSBOb2RlQ29sb3IuQmxhY2spO1xuXHRcdGFzc2VydChnZXROb2RlQ29sb3IocikgPT09IE5vZGVDb2xvci5CbGFjayk7XG5cdH1cblxuXHRsZXQgZXhwZWN0ZWRNYXhFbmQgPSBuLmVuZDtcblx0aWYgKGwgIT09IFNFTlRJTkVMKSB7XG5cdFx0YXNzZXJ0KGludGVydmFsQ29tcGFyZShsLnN0YXJ0ICsgZGVsdGEsIGwuZW5kICsgZGVsdGEsIG4uc3RhcnQgKyBkZWx0YSwgbi5lbmQgKyBkZWx0YSkgPD0gMCk7XG5cdFx0ZXhwZWN0ZWRNYXhFbmQgPSBNYXRoLm1heChleHBlY3RlZE1heEVuZCwgbC5tYXhFbmQpO1xuXHR9XG5cdGlmIChyICE9PSBTRU5USU5FTCkge1xuXHRcdGFzc2VydChpbnRlcnZhbENvbXBhcmUobi5zdGFydCArIGRlbHRhLCBuLmVuZCArIGRlbHRhLCByLnN0YXJ0ICsgZGVsdGEgKyBuLmRlbHRhLCByLmVuZCArIGRlbHRhICsgbi5kZWx0YSkgPD0gMCk7XG5cdFx0ZXhwZWN0ZWRNYXhFbmQgPSBNYXRoLm1heChleHBlY3RlZE1heEVuZCwgci5tYXhFbmQgKyBuLmRlbHRhKTtcblx0fVxuXHRhc3NlcnQobi5tYXhFbmQgPT09IGV4cGVjdGVkTWF4RW5kKTtcblxuXHRhc3NlcnRWYWxpZE5vZGUobCwgZGVsdGEpO1xuXHRhc3NlcnRWYWxpZE5vZGUociwgZGVsdGEgKyBuLmRlbHRhKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VmFsaWRUcmVlKFQ6IEludGVydmFsVHJlZSk6IHZvaWQge1xuXHRpZiAoVC5yb290ID09PSBTRU5USU5FTCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhc3NlcnQoZ2V0Tm9kZUNvbG9yKFQucm9vdCkgPT09IE5vZGVDb2xvci5CbGFjayk7XG5cdGFzc2VydChkZXB0aChULnJvb3QubGVmdCkgPT09IGRlcHRoKFQucm9vdC5yaWdodCkpO1xuXHRhc3NlcnRWYWxpZE5vZGUoVC5yb290LCAwKTtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxjQUFjLGNBQWMsV0FBVyxVQUFVLGNBQWMsaUJBQWlCLGdCQUFnQix5QkFBeUI7QUFFbEksTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSxhQUFhLGlCQUFpQixNQUFRO0FBQzVDLE1BQU0sYUFBYTtBQUNuQixNQUFNLHFCQUFxQjtBQUMzQixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLGNBQWM7QUFDcEIsTUFBTSxjQUFjO0FBQ3BCLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0sa0JBQWtCLE1BQU07QUFFN0IsMENBQXdDO0FBQUEsRUFFeEMsTUFBTSxTQUFTO0FBQUEsSUFNZCxZQUFZLE9BQWUsS0FBYTtBQUx4Qyw0QkFBdUI7QUFNdEIsV0FBSyxRQUFRO0FBQ2IsV0FBSyxNQUFNO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTztBQUFBLElBR1osY0FBYztBQUNiLFdBQUssWUFBWSxDQUFDO0FBQUEsSUFDbkI7QUFBQSxJQUVPLE9BQU8sVUFBOEI7QUFDM0MsV0FBSyxVQUFVLEtBQUssUUFBUTtBQUM1QixXQUFLLFVBQVUsS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUM3QixZQUFJLEVBQUUsVUFBVSxFQUFFLE9BQU87QUFDeEIsaUJBQU8sRUFBRSxNQUFNLEVBQUU7QUFBQSxRQUNsQjtBQUNBLGVBQU8sRUFBRSxRQUFRLEVBQUU7QUFBQSxNQUNwQixDQUFDO0FBQ0QsYUFBTztBQUFBLElBQ1I7QUFBQSxJQUVPLE9BQU8sVUFBMEI7QUFDdkMsZUFBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLFVBQVUsUUFBUSxJQUFJLEtBQUssS0FBSztBQUMxRCxZQUFJLEtBQUssVUFBVSxDQUFDLE1BQU0sVUFBVTtBQUNuQyxlQUFLLFVBQVUsT0FBTyxHQUFHLENBQUM7QUFDMUI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUVPLE9BQU8sVUFBZ0M7QUFDN0MsWUFBTSxTQUFxQixDQUFDO0FBQzVCLGVBQVMsSUFBSSxHQUFHLE1BQU0sS0FBSyxVQUFVLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDMUQsY0FBTSxNQUFNLEtBQUssVUFBVSxDQUFDO0FBQzVCLFlBQUksSUFBSSxTQUFTLFNBQVMsT0FBTyxJQUFJLE9BQU8sU0FBUyxPQUFPO0FBQzNELGlCQUFPLEtBQUssR0FBRztBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxVQUFVO0FBQUEsSUFBaEI7QUFDQyxXQUFRLFVBQWtCLElBQUksT0FBTztBQUNyQyxXQUFRLFFBQXNCLElBQUksYUFBYTtBQUMvQyxXQUFRLGNBQWM7QUFDdEIsV0FBUSxhQUF5QyxDQUFDO0FBQ2xELFdBQVEsZUFBdUMsQ0FBQztBQUFBO0FBQUEsSUFFekMsU0FBUyxJQUFzQjtBQUVyQyxVQUFJLEdBQUcsU0FBUyxVQUFVO0FBQ3pCLFlBQUksWUFBWTtBQUNmLGtCQUFRLElBQUksWUFBWSxLQUFLLFVBQVUsSUFBSSxTQUFTLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUc7QUFBQSxRQUMxRTtBQUNBLGNBQU0sU0FBVSxFQUFFLEtBQUs7QUFDdkIsYUFBSyxXQUFXLE1BQU0sSUFBSSxJQUFJLGFBQWEsTUFBTyxHQUFHLE9BQU8sR0FBRyxHQUFHO0FBQ2xFLGFBQUssTUFBTSxPQUFPLEtBQUssV0FBVyxNQUFNLENBQUU7QUFDMUMsYUFBSyxhQUFhLE1BQU0sSUFBSSxLQUFLLFFBQVEsT0FBTyxJQUFJLFNBQVMsR0FBRyxPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDL0UsV0FBVyxHQUFHLFNBQVMsVUFBVTtBQUNoQyxZQUFJLFlBQVk7QUFDZixrQkFBUSxJQUFJLFlBQVksS0FBSyxVQUFVLEtBQUssYUFBYSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUc7QUFBQSxRQUNwRTtBQUNBLGFBQUssTUFBTSxPQUFPLEtBQUssV0FBVyxHQUFHLEVBQUUsQ0FBRTtBQUN6QyxhQUFLLFFBQVEsT0FBTyxLQUFLLGFBQWEsR0FBRyxFQUFFLENBQUU7QUFFN0MsYUFBSyxXQUFXLEdBQUcsRUFBRSxJQUFJO0FBQ3pCLGFBQUssYUFBYSxHQUFHLEVBQUUsSUFBSTtBQUFBLE1BQzVCLFdBQVcsR0FBRyxTQUFTLFVBQVU7QUFFaEMsYUFBSyxNQUFNLE9BQU8sS0FBSyxXQUFXLEdBQUcsRUFBRSxDQUFFO0FBQ3pDLGFBQUssV0FBVyxHQUFHLEVBQUUsRUFBRyxNQUFNLEdBQUcsR0FBRyxPQUFPLEdBQUcsS0FBSyxJQUFLO0FBQ3hELGFBQUssTUFBTSxPQUFPLEtBQUssV0FBVyxHQUFHLEVBQUUsQ0FBRTtBQUV6QyxhQUFLLFFBQVEsT0FBTyxLQUFLLGFBQWEsR0FBRyxFQUFFLENBQUU7QUFDN0MsYUFBSyxhQUFhLEdBQUcsRUFBRSxFQUFHLFFBQVEsR0FBRztBQUNyQyxhQUFLLGFBQWEsR0FBRyxFQUFFLEVBQUcsTUFBTSxHQUFHO0FBQ25DLGFBQUssUUFBUSxPQUFPLEtBQUssYUFBYSxHQUFHLEVBQUUsQ0FBRTtBQUFBLE1BRTlDLE9BQU87QUFDTixjQUFNLGNBQWMsS0FBSyxNQUFNLGVBQWUsR0FBRyxPQUFPLEdBQUcsS0FBSyxHQUFHLE9BQU8sT0FBTyxHQUFHLEtBQUs7QUFDekYsY0FBTUEsVUFBUyxZQUFZLElBQUksT0FBSyxJQUFJLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsQ0FBQztBQUM1RixjQUFNQyxZQUFXLEtBQUssUUFBUSxPQUFPLElBQUksU0FBUyxHQUFHLE9BQU8sR0FBRyxHQUFHLENBQUM7QUFDbkUsZUFBTyxnQkFBZ0JELFNBQVFDLFNBQVE7QUFDdkM7QUFBQSxNQUNEO0FBRUEsVUFBSSxZQUFZO0FBQ2Ysa0JBQVUsS0FBSyxLQUFLO0FBQUEsTUFDckI7QUFFQSwyQkFBcUIsS0FBSyxLQUFLO0FBRS9CLFlBQU0sU0FBUyxLQUFLLE1BQU0sY0FBYyxFQUFFLElBQUksT0FBSyxJQUFJLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsQ0FBQztBQUMzRyxZQUFNLFdBQVcsS0FBSyxRQUFRO0FBQzlCLGFBQU8sZ0JBQWdCLFFBQVEsUUFBUTtBQUFBLElBQ3hDO0FBQUEsSUFFTyxrQkFBa0IsT0FBdUI7QUFDL0MsVUFBSSxZQUFZO0FBQ2hCLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxXQUFXLFFBQVEsS0FBSztBQUNoRCxZQUFJLEtBQUssV0FBVyxDQUFDLE1BQU0sTUFBTTtBQUNoQztBQUFBLFFBQ0Q7QUFDQTtBQUNBLFlBQUksY0FBYyxPQUFPO0FBQ3hCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBNEJBLFdBQVMsaUJBQWlCLEtBQXlCO0FBQ2xELFVBQU0sUUFBUSxJQUFJLFVBQVU7QUFDNUIsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFFBQVEsS0FBSztBQUNwQyxZQUFNLFNBQVMsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFFQSxXQUFTLGFBQWEsS0FBYSxLQUFxQjtBQUN2RCxXQUFPLEtBQUssTUFBTSxLQUFLLE9BQU8sS0FBSyxNQUFNLE1BQU0sRUFBRSxJQUFJO0FBQUEsRUFDdEQ7QUFFQSxXQUFTLGVBQWUsS0FBYSxLQUErQjtBQUNuRSxVQUFNLFFBQVEsYUFBYSxLQUFLLEdBQUc7QUFDbkMsUUFBSTtBQUNKLFFBQUksYUFBYSxHQUFHLEVBQUUsS0FBSyxHQUFHO0FBRTdCLGVBQVMsYUFBYSxHQUFHLE1BQU0sS0FBSztBQUFBLElBQ3JDLE9BQU87QUFFTixlQUFTLGFBQWEsR0FBRyxLQUFLLElBQUksTUFBTSxPQUFPLEVBQUUsQ0FBQztBQUFBLElBQ25EO0FBQ0EsV0FBTyxDQUFDLE9BQU8sUUFBUSxNQUFNO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE1BQU0sU0FBUztBQUFBLElBT2QsY0FBYztBQU5kLFdBQVEsT0FBcUIsQ0FBQztBQUM5QixXQUFRLFNBQW9CLElBQUksVUFBVTtBQU16QyxXQUFLLGFBQWEsYUFBYSxhQUFhLFdBQVc7QUFDdkQsV0FBSyxhQUFhLGFBQWEsZ0JBQWdCLGNBQWM7QUFDN0QsV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxJQUVRLGtCQUF3QjtBQUMvQixZQUFNLFFBQVEsZUFBZSxvQkFBb0IsZ0JBQWdCO0FBQ2pFLFdBQUssS0FBSztBQUFBLFFBQ1QsTUFBTTtBQUFBLFFBQ04sT0FBTyxNQUFNLENBQUM7QUFBQSxRQUNkLEtBQUssTUFBTSxDQUFDO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRVEsa0JBQXdCO0FBQy9CLFlBQU0sTUFBTSxhQUFhLEtBQUssTUFBTSxLQUFLLGFBQWEsQ0FBQyxHQUFHLEtBQUssYUFBYSxDQUFDO0FBQzdFLFdBQUssS0FBSztBQUFBLFFBQ1QsTUFBTTtBQUFBLFFBQ04sSUFBSSxLQUFLLE9BQU8sa0JBQWtCLEdBQUc7QUFBQSxNQUN0QyxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRVEsa0JBQXdCO0FBQy9CLFlBQU0sTUFBTSxhQUFhLEdBQUcsS0FBSyxhQUFhLENBQUM7QUFDL0MsWUFBTSxRQUFRLGVBQWUsb0JBQW9CLGdCQUFnQjtBQUNqRSxXQUFLLEtBQUs7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLElBQUksS0FBSyxPQUFPLGtCQUFrQixHQUFHO0FBQUEsUUFDckMsT0FBTyxNQUFNLENBQUM7QUFBQSxRQUNkLEtBQUssTUFBTSxDQUFDO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRU8sTUFBTTtBQUNaLGFBQU8sS0FBSyxhQUFhLEtBQUssS0FBSyxhQUFhLEtBQUssS0FBSyxhQUFhLEdBQUc7QUFDekUsWUFBSSxLQUFLLGFBQWEsR0FBRztBQUN4QixlQUFLLGdCQUFnQjtBQUNyQixlQUFLO0FBQ0wsZUFBSztBQUFBLFFBQ04sV0FBVyxLQUFLLGFBQWEsR0FBRztBQUMvQixlQUFLLGdCQUFnQjtBQUNyQixlQUFLO0FBQUEsUUFDTixPQUFPO0FBQ04sZUFBSyxnQkFBZ0I7QUFDckIsZUFBSztBQUFBLFFBQ047QUFHQSxjQUFNLGNBQWMsZUFBZSxvQkFBb0IsZ0JBQWdCO0FBQ3ZFLGFBQUssS0FBSztBQUFBLFVBQ1QsTUFBTTtBQUFBLFVBQ04sT0FBTyxZQUFZLENBQUM7QUFBQSxVQUNwQixLQUFLLFlBQVksQ0FBQztBQUFBLFFBQ25CLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLElBRVEsS0FBSyxJQUFzQjtBQUNsQyxXQUFLLEtBQUssS0FBSyxFQUFFO0FBQ2pCLFdBQUssT0FBTyxTQUFTLEVBQUU7QUFBQSxJQUN4QjtBQUFBLElBRU8sUUFBYztBQUNwQixjQUFRLElBQUksb0JBQW9CLEtBQUssVUFBVSxLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsSUFDN0Q7QUFBQSxFQUVEO0FBRUEsUUFBTSxhQUFhLE1BQU07QUFDeEIsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDdEMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssU0FBUyxNQUFNO0FBQ25CLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxJQUFJO0FBQUEsUUFDdEMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLE1BQ3RDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLEtBQUssS0FBSyxJQUFJO0FBQUEsUUFDdkMsRUFBRSxNQUFNLFVBQVUsT0FBTyxLQUFLLEtBQUssSUFBSTtBQUFBLE1BQ3hDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUN0QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDdEMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssU0FBUyxNQUFNO0FBQ25CLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxJQUFJO0FBQUEsUUFDdEMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQUEsUUFDcEMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsSUFBSSxFQUFFO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssU0FBUyxNQUFNO0FBQ25CLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQUEsUUFDcEMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsSUFBSSxFQUFFO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssU0FBUyxNQUFNO0FBQ25CLHVCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxHQUFHLEtBQUssRUFBRTtBQUFBLFFBQ25DLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxTQUFTLE1BQU07QUFDbkIsdUJBQWlCO0FBQUEsUUFDaEIsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxHQUFHLEtBQUssR0FBRztBQUFBLFFBQ3BDLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxRQUNyQyxFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFNBQVMsTUFBTTtBQUNuQix1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsUUFDckMsRUFBRSxNQUFNLFVBQVUsT0FBTyxJQUFJLEtBQUssR0FBRztBQUFBLFFBQ3JDLEVBQUUsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUN0QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx3QkFBd0IsTUFBTTtBQUdsQyx1QkFBaUI7QUFBQSxRQUNoQixFQUFFLE1BQU0sVUFBVSxPQUFPLGlCQUFpQixLQUFLLGdCQUFnQjtBQUFBLFFBQy9ELEVBQUUsTUFBTSxVQUFVLE9BQU8saUJBQWlCLEtBQUssZ0JBQWdCO0FBQUEsUUFDL0QsRUFBRSxNQUFNLFVBQVUsT0FBTyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFBQSxRQUMvRCxFQUFFLE1BQU0sVUFBVSxPQUFPLGlCQUFpQixLQUFLLGdCQUFnQjtBQUFBLFFBQy9ELEVBQUUsTUFBTSxVQUFVLE9BQU8saUJBQWlCLEtBQUssZ0JBQWdCO0FBQUEsUUFDL0QsRUFBRSxNQUFNLFVBQVUsT0FBTyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFBQSxNQUNoRSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBS0QsV0FBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDcEMsUUFBSSxJQUFJLFFBQVEsR0FBRztBQUNsQixjQUFRLElBQUksUUFBUSxJQUFJLENBQUMsSUFBSSxVQUFVLEVBQUU7QUFBQSxJQUMxQztBQUNBLFVBQU1DLFFBQU8sSUFBSSxTQUFTO0FBRTFCLFFBQUk7QUFDSCxNQUFBQSxNQUFLLElBQUk7QUFBQSxJQUNWLFNBQVMsS0FBSztBQUNiLGNBQVEsSUFBSSxHQUFHO0FBQ2YsTUFBQUEsTUFBSyxNQUFNO0FBQ1g7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFFBQU0sYUFBYSxNQUFNO0FBRXhCLGFBQVMsbUJBQWlDO0FBQ3pDLFlBQU0sSUFBSSxJQUFJLGFBQWE7QUFDM0IsWUFBTSxPQUEyQjtBQUFBLFFBQ2hDLENBQUMsSUFBSSxFQUFFO0FBQUEsUUFDUCxDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQ0wsQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUNQLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDTCxDQUFDLElBQUksRUFBRTtBQUFBLFFBQ1AsQ0FBQyxJQUFJLEVBQUU7QUFBQSxRQUNQLENBQUMsSUFBSSxFQUFFO0FBQUEsUUFDUCxDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQ0wsQ0FBQyxHQUFHLEVBQUU7QUFBQSxRQUNOLENBQUMsSUFBSSxFQUFFO0FBQUEsTUFDUjtBQUNBLFdBQUssUUFBUSxDQUFDLFFBQVE7QUFDckIsY0FBTSxPQUFPLElBQUksYUFBYSxNQUFPLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ25ELFVBQUUsT0FBTyxJQUFJO0FBQUEsTUFDZCxDQUFDO0FBQ0QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLElBQUksaUJBQWlCO0FBRTNCLGFBQVMscUJBQXFCLE9BQWUsS0FBYSxVQUFvQztBQUM3RixZQUFNLGNBQWMsRUFBRSxlQUFlLE9BQU8sS0FBSyxHQUFHLE9BQU8sT0FBTyxHQUFHLEtBQUs7QUFDMUUsWUFBTSxTQUFTLFlBQVksSUFBSSxDQUFDLE1BQXdCLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsQ0FBQztBQUNwRyxhQUFPLGdCQUFnQixRQUFRLFFBQVE7QUFBQSxJQUN4QztBQUVBLFNBQUssZUFBZSxNQUFNO0FBQ3pCO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUNIO0FBQUEsVUFDQyxDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQ047QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxlQUFlLE1BQU07QUFDekI7QUFBQSxRQUNDO0FBQUEsUUFBRztBQUFBLFFBQ0g7QUFBQSxVQUNDLENBQUMsR0FBRyxDQUFDO0FBQUEsVUFDTCxDQUFDLEdBQUcsRUFBRTtBQUFBLFVBQ04sQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUJBQWlCLE1BQU07QUFDM0I7QUFBQSxRQUNDO0FBQUEsUUFBSTtBQUFBLFFBQ0o7QUFBQSxVQUNDLENBQUMsR0FBRyxFQUFFO0FBQUEsVUFDTixDQUFDLElBQUksRUFBRTtBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxpQkFBaUIsTUFBTTtBQUMzQjtBQUFBLFFBQ0M7QUFBQSxRQUFJO0FBQUEsUUFDSjtBQUFBLFVBQ0MsQ0FBQyxJQUFJLEVBQUU7QUFBQSxVQUNQLENBQUMsSUFBSSxFQUFFO0FBQUEsVUFDUCxDQUFDLElBQUksRUFBRTtBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxpQkFBaUIsTUFBTTtBQUMzQjtBQUFBLFFBQ0M7QUFBQSxRQUFJO0FBQUEsUUFDSixDQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLDBDQUF3QztBQUV4QyxXQUFTLHFCQUFxQixLQUFhLFdBQW1CLFNBQWlCLGdCQUF3QyxPQUFlLEtBQWEsWUFBb0Isa0JBQTJCLG1CQUEyQixpQkFBK0I7QUFDM1AsVUFBTSxPQUFPLElBQUksYUFBYSxJQUFJLFdBQVcsT0FBTztBQUNwRCxzQkFBa0IsTUFBTSxjQUFjO0FBQ3RDLG1CQUFlLE1BQU0sT0FBTyxLQUFLLFlBQVksZ0JBQWdCO0FBQzdELFdBQU8sZ0JBQWdCLENBQUMsS0FBSyxPQUFPLEtBQUssR0FBRyxHQUFHLENBQUMsbUJBQW1CLGVBQWUsR0FBRyxHQUFHO0FBQUEsRUFDekY7QUFFQSxPQUFLLGtCQUFrQixNQUFNO0FBRTVCO0FBRUMsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFFeEcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFBQSxJQUN6RztBQUdBO0FBRUMsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFFeEcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFFeEcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFFeEcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDekcsMkJBQXFCLFNBQVMsR0FBRyxHQUFHLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHeEcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFHM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDakgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFFNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDakgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFHNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHekcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFHMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDakgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsSUFBSSxJQUFJLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFHNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDOUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFDM0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUM7QUFFMUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDaEgsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw2QkFBNkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDL0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDN0csMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1QiwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsT0FBTyxHQUFHLEVBQUU7QUFDNUcsMkJBQXFCLFNBQVMsR0FBRyxJQUFJLHVCQUF1Qiw4QkFBOEIsR0FBRyxJQUFJLEdBQUcs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
